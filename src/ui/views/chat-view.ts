import type { TaskAuthorization } from '@/features/agent';
import { notify } from '@/core/notifications';
import { ItemView, WorkspaceLeaf, TFile, TFolder, setIcon } from 'obsidian';
import { t } from '@/i18n';
import { showConfirm } from '@/ui/modals/confirm-modal';
import { AgentCapabilityModal } from '@/ui/modals/agent-capability-modal';
import type IntelligenceAssistantPlugin from '@plugin';
import type { Message, Conversation } from '@/features/conversations';
import type { AgentExecutionStep } from '@/features/llm';
import { ModelManager } from '@qwai/obsidian-llm';
import { ChatViewState } from '@/ui/state/chat-view-state';
import { ConversationManager } from '@/ui/chat/managers/conversation-manager';
import type { MessageRendererCallbacks } from '@/ui/chat/message-renderer';
import { ChatMessageList } from '@/ui/chat/chat-message-list';
import { addReferences, pickImages, pickReferences } from '@/ui/chat/chat-pickers';
import { ChatController } from '@/ui/chat/controllers/chat-controller';
import { ChatHeaderComponent } from '@/ui/chat/chat-header.component';
import { ChatInputComponent } from '@/ui/chat/chat-input.component';
import { ChatSessionController } from '@/ui/chat/chat-session-controller';
import { openingSession, agentModelId, pickAgentId } from '@/features/chat';
import { modelCatalog } from '@/ui/modals/agent-model-options';
import { MentionSuggest } from '@/ui/suggest/mention-suggest';
import { internalLinktextFromEvent, openClickedInternalLink, triggerHoverLink } from '@/ui/chat/hover-link';
import { RagStatusPanel } from '@/ui/chat/rag-status-panel';
import { resolveMessageProviderId } from '@/ui/chat/utils/provider-utils';
import { providerColor } from '@/ui/provider-meta';
import { TestIds } from '@/ui/utils/test-ids';
import type { AppServices } from '@/ui/app-services';
import { applyWriteProposal, type BatchWriteProposal, type WriteProposal } from '@/features/agent';
import { describeProposal } from '@/ui/chat/write-proposal-cards';
import { errorMessage } from '@/core/utils/errors';
import { hasSettings } from '@/core/utils/type-guards';

export const CHAT_VIEW_TYPE = 'intelligence-assistant-chat';

export class ChatView extends ItemView {
	private readonly state = new ChatViewState();
	private readonly chatController: ChatController;
	private conversationManager: ConversationManager;
	private chatHeader: ChatHeaderComponent;
	private chatInput: ChatInputComponent;
	private session: ChatSessionController;
	private messageList: ChatMessageList;
	private mentionSuggest: MentionSuggest | null = null;
	private conversationListContainer: HTMLElement;
	private pendingAgentTask: { prompt: string; displayText: string; authorization?: TaskAuthorization } | null = null;
	private services: AppServices;
	private ragStatusPanel: RagStatusPanel;

	constructor(leaf: WorkspaceLeaf, private readonly plugin: IntelligenceAssistantPlugin) {
		super(leaf);
		this.chatController = new ChatController(this.app, this.plugin, this.state);
	}

	getViewType(): string {
		return CHAT_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'AI chat';
	}

	getIcon(): string {
		return 'message-square';
	}

	async onOpen() {
		this.services = await this.plugin.whenServicesReady();
		this.ragStatusPanel = new RagStatusPanel(
			this.app,
			this.services.rag,
			() => this.state.enableRAG,
			() => this.state.mode,
			() => this.plugin.settings.ragConfig
		);
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('intelligence-assistant-chat-container');
		container.setAttribute('data-testid', TestIds.chat.container);

		const opening = openingSession(this.plugin.settings, this.plugin.settings.defaultChatMode);
		await this.plugin.updateSettings((settings) => {
			this.state.mode = opening.mode;
			settings.activeAgentId = opening.activeAgentId;
		});

		const mainLayout = container.createDiv('chat-main-layout');
		const mainChatContainer = mainLayout.createDiv('main-chat-area');
		this.conversationListContainer = mainLayout.createDiv('conversation-list-floating is-collapsed');
		this.conversationListContainer.setAttribute('data-testid', TestIds.chat.conversationList);

		this.chatHeader = new ChatHeaderComponent(mainChatContainer, this.plugin, {
			onToggleConversations: async () => { await this.conversationManager?.toggleConversationList(); },
			onShowCapabilities: () => new AgentCapabilityModal(this.app, this.capabilitySummary(this.state.referencedFiles), () => {
				if (hasSettings(this.app)) { this.app.setting.open(); this.app.setting.openTabById(this.plugin.manifest.id); }
			}).open(),
			onNewChat: async () => {
				await this.session.startNewChat();
				await this.conversationManager.createNewConversation();
			}
		});

		const messageArea = mainChatContainer.createDiv('ia-chat-message-area');
		this.messageList = new ChatMessageList(messageArea, this.app, this.plugin, this.state, this.rendererCallbacks());
		this.renderScrollToBottom(messageArea);

		this.chatInput = new ChatInputComponent(mainChatContainer, this.app, this.plugin, this.state, {
			onSendMessage: (text) => this.sendMessage(text),
			onAttachImage: () => {
				pickImages(this.app, this.state, () => this.chatInput.updateAttachmentPreview());
				return Promise.resolve();
			},
			onToggleRag: () => this.session.toggleRag(),
			onToggleWeb: () => this.session.toggleWebSearch(),
			onShowReferenceMenu: () => pickReferences(this.app, this.state, () => this.chatInput.updateReferenceDisplay()),
			onStopStreaming: () => {
				this.state.stopRun();
				this.chatInput.stopBtn?.addClass('ia-hidden');
				notify(t('chat.notices.stopping'));
			},
			onModeChange: (mode) => this.session.changeMode(mode),
			onModelChange: () => this.session.refreshImageButton(),
			onAgentChange: (agentId) => this.session.selectAgent(agentId)
		});
		this.session = new ChatSessionController(this.plugin, this.state, {
			input: this.chatInput,
			header: this.chatHeader,
			refreshRagStatus: () => this.updateRagStatus(),
		});

		this.mentionSuggest = new MentionSuggest(this.app, this.chatInput.textarea, (file) => {
			addReferences(this.state, [file]);
			this.chatInput.updateReferenceDisplay();
		});

		await this.refreshModels();
		if (this.plugin.settings.defaultModel && this.chatInput.modelSelect.value === '') {
			this.chatInput.modelSelect.value = this.plugin.settings.defaultModel;
		}
		await this.session.refreshOptions();

		this.registerOutsideClickToCloseConversations();
		this.registerHoverPreviews();

		try {
			await this.updateRagStatus();
		} catch (error) {
			console.error('Error initializing RAG:', error);
			notify(t('chat.notices.ragInitError', { message: errorMessage(error) }));
		}

		void this.chatController.initialize();

		this.conversationManager = new ConversationManager(
			this.app,
			this.plugin,
			this.services.conversations,
			this.services.namer,
			this.state,
			this.messageList.element,
			this.chatInput.modelSelect,
			(messages: Message[]) => this.messageList.render(messages),
			() => this.updateTokenSummary()
		);
		void this.conversationManager.initializeContainer(this.conversationListContainer);
		this.configureChatController();
		this.bindConversationEvents();

		await this.conversationManager.loadOrCreateConversation();
	}

	public async refreshModels(showNotice: boolean = false) {
		const select = this.chatInput.modelSelect;
		try {
			const previousSelection = select.value;
			this.state.availableModels = await ModelManager.getAllChatModels(this.plugin.settings.llmConfigs);
			this.chatInput.updateModelOptions();

			const available = (id: string | undefined) => Boolean(id) && this.state.availableModels.some(model => model.id === id);
			if (available(previousSelection)) {
				select.value = previousSelection;
			} else if (available(this.plugin.settings.defaultModel)) {
				select.value = this.plugin.settings.defaultModel;
			}

			await this.session.refreshImageButton();
			if (showNotice) {
				notify(t('chat.notices.modelsRefreshed'));
			}
		} catch (error) {
			console.error('Failed to refresh models:', error);
			if (showNotice) {
				notify(t('chat.notices.modelsRefreshFailed', { message: errorMessage(error) }));
			}
		}
	}

	public async startAgentTask(options: {
		prompt: string;
		displayText?: string;
		references?: Array<TFile | TFolder>;
		newConversation?: boolean;
		sendImmediately?: boolean;
		authorization?: TaskAuthorization;
	}): Promise<{ conversationId: string; content: string } | null> {
		const prompt = options.prompt.trim();
		if (!prompt || this.state.isStreaming) return null;
		const displayText = (options.displayText?.trim() || prompt).trim();

		if (options.newConversation) {
			await this.conversationManager.createNewConversation();
		}
		if (this.state.mode !== 'agent') {
			await this.session.changeMode('agent');
		}

		addReferences(this.state, options.references ?? []);
		this.chatInput.updateReferenceDisplay();

		this.pendingAgentTask = { prompt, displayText, authorization: options.authorization };
		this.chatInput.textarea.value = displayText;
		this.chatInput.textarea.dispatchEvent(new Event('input', { bubbles: true }));
		this.chatInput.textarea.focus();

		if (options.sendImmediately) {
			const before = this.state.messages.length;
			this.messageList.showPreflight(displayText, this.capabilitySummary(options.references ?? []).preflightItems);
			await this.sendMessage(displayText);
			const reply = this.state.messages.slice(before).reverse().find(message => message.role === 'assistant');
			if (reply && this.state.currentConversationId) return { conversationId: this.state.currentConversationId, content: reply.content || t('ux.emptyReply') };
		}
		return null;
	}

	public async taskPreview(references: Array<TFile | TFolder>): Promise<string[]> {
		if (!pickAgentId(this.plugin.settings)) await this.plugin.ensureDefaultAgent();
		const agent = this.plugin.settings.agents.find(candidate => candidate.id === pickAgentId(this.plugin.settings));
		const selected = this.chatInput.modelSelect.value || this.plugin.settings.defaultModel;
		const id = agent ? agentModelId(agent, selected, this.plugin.settings.defaultModel) : selected;
		const label = modelCatalog(this.plugin.settings.llmConfigs).options.find(model => model.id === id)?.label || id || t('chat.header.noModels');
		const summary = this.session.capabilitySummary(this.services.tools.registry, references, 'agent');
		return [summary.agentName, label, ...summary.preflightItems];
	}

	onClose(): Promise<void> {
		this.mentionSuggest?.close();
		void this.chatController?.cleanup();
		return Promise.resolve();
	}

	private async sendMessage(text: string) {
		const pendingTask = this.pendingAgentTask;
		this.pendingAgentTask = null;
		const usePendingTask = pendingTask !== null && this.state.mode === 'agent' && text.trim() === pendingTask.displayText.trim();
		await this.chatController.sendMessage(text, usePendingTask ? { llmContentOverride: pendingTask.prompt, authorization: pendingTask.authorization } : undefined);
	}

	private rendererCallbacks(): MessageRendererCallbacks {
		return {
			saveMessageToNewNote: (message) => this.services.vaultExport.saveToNewNote(message),
			insertMessageToNote: (message) => this.services.vaultExport.insertIntoNote(message),
			regenerateMessage: (message, element) => this.chatController.regenerateMessage(message, element),
			displayRagSources: (container, message) => this.ragStatusPanel.displaySources(container, message.ragSources ?? []),
			getProviderColor: (message) => providerColor(resolveMessageProviderId(message, this.plugin)),
			applyWriteProposal: (proposal, step) => this.confirmAndApplyProposal(proposal, step),
		};
	}

	private configureChatController(): void {
		this.chatController.configure({
			chatContainer: this.messageList.element,
			chatService: this.services.chat,
			conversationManager: this.conversationManager,
			ragStatusPanel: this.ragStatusPanel,
			getSelectedModel: () => this.chatInput.modelSelect.value,
			clearInputUI: () => {
				this.chatInput.textarea.value = '';
				this.chatInput.textarea.dispatchEvent(new Event('input', { bubbles: true }));
				this.chatInput.updateAttachmentPreview();
				this.chatInput.updateReferenceDisplay();
			},
			addMessageToUI: (message: Message) => this.messageList.add(message),
			updateTokenSummary: () => this.updateTokenSummary(),
			findMessageContentElement: (element: HTMLElement) => this.messageList.contentOf(element),
			findMessageBodyElement: (element: HTMLElement) => this.messageList.bodyOf(element),
			onStreamingStateChange: (isStreaming: boolean) => {
				this.chatInput.setStreaming(isStreaming);
				if (isStreaming) {
					this.services.activity.begin();
				} else {
					this.services.activity.end();
				}
			},
		});
	}

	private bindConversationEvents(): void {
		const applyConversation = (conversation: Conversation) => {
			this.chatHeader.updateConversationTitle(conversation.title);
			void this.session.applyConversation(conversation);
		};
		this.conversationManager.on('conversation-loaded', applyConversation);
		this.conversationManager.on('conversation-created', applyConversation);
		this.conversationManager.on('conversation-updated', (conversation: Conversation) => {
			if (conversation.id === this.state.currentConversationId) {
				this.chatHeader.updateConversationTitle(conversation.title);
			}
		});
	}

	private renderScrollToBottom(parent: HTMLElement): void {
		const button = parent.createEl('button', { cls: 'ia-scroll-to-bottom ia-hidden', attr: { type: 'button', 'aria-label': t('chat.scrollToBottom') } });
		setIcon(button, 'arrow-down');
		button.addEventListener('click', () => {
			this.messageList.scrollToEnd();
			button.addClass('ia-hidden');
		});
		this.registerDomEvent(this.messageList.element, 'scroll', () => {
			button.toggleClass('ia-hidden', !this.messageList.isAwayFromEnd());
		});
	}

	private registerOutsideClickToCloseConversations(): void {
		this.registerDomEvent(this.containerEl.ownerDocument, 'click', (event: MouseEvent) => {
			if (this.state.conversationListPinned || !this.state.conversationListVisible) return;
			if (!this.conversationListContainer.contains(event.target as HTMLElement)) {
				this.state.conversationListVisible = false;
				this.conversationListContainer.removeClass('is-open');
				this.conversationListContainer.addClass('is-collapsed');
			}
		});
	}

	private registerHoverPreviews(): void {
		this.registerDomEvent(this.messageList.element, 'mouseover', (event: MouseEvent) => {
			const hit = internalLinktextFromEvent(event.target);
			if (!hit) return;
			triggerHoverLink(this.app.workspace, {
				event,
				hoverParent: this,
				targetEl: hit.el,
				linktext: hit.linktext,
				sourcePath: this.app.workspace.getActiveFile()?.path ?? '',
			});
		});
		this.registerDomEvent(this.messageList.element, 'click', (event: MouseEvent) => {
			openClickedInternalLink(this.app.workspace, event, this.app.workspace.getActiveFile()?.path ?? '');
		});
	}

	private capabilitySummary(references: Array<TFile | TFolder>) {
		return this.session.capabilitySummary(this.services.tools.registry, references);
	}

	private async confirmAndApplyProposal(proposal: WriteProposal | BatchWriteProposal, step: AgentExecutionStep): Promise<boolean> {
		const summary = describeProposal(proposal);
		if (!await showConfirm(this.app, t('chat.proposals.confirm', { summary }), { title: t('ux.applyProposal'), confirmText: t('chat.proposals.apply'), destructive: false })) return false;
		await applyWriteProposal(this.app, proposal);
		step.proposalApplied = true;
		await this.conversationManager.saveCurrentConversation();
		notify(t('chat.proposals.appliedNotice', { summary }));
		return true;
	}

	private async updateRagStatus(): Promise<void> {
		await this.ragStatusPanel.updateStatus(this.chatInput.ragActionItem);
	}

	private updateTokenSummary(): void {
		const total = this.state.messages.reduce((sum, message) =>
			sum + (message.role === 'assistant' ? message.tokenUsage?.totalTokens ?? 0 : 0), 0);
		this.chatHeader.updateTokenSummary(total);
	}
}
