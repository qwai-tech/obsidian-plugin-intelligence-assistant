import { ItemView, WorkspaceLeaf, Notice, TFile, TFolder, setIcon } from 'obsidian';
import { t } from '@/i18n';
import { showConfirm } from '@/ui/modals/confirm-modal';
import { AgentCapabilityModal } from '@/ui/modals/agent-capability-modal';
import type IntelligenceAssistantPlugin from '@plugin';
import type { Message, Conversation } from '@/features/conversations';
import { ModelManager } from '@qwai/obsidian-llm';
import { ChatViewState } from '@/ui/state/chat-view-state';
import { ConversationManager } from '@/ui/chat/managers/conversation-manager';
import type { MessageRendererCallbacks } from '@/ui/chat/message-renderer';
import { ChatMessageList } from '@/ui/chat/chat-message-list';
import { addReferences, pickImages, pickReferences } from '@/ui/chat/chat-pickers';
import { InputController } from '@/ui/chat/controllers/input-controller';
import { ChatController } from '@/ui/chat/controllers/chat-controller';
import { ChatHeaderComponent } from '@/ui/chat/chat-header.component';
import { ChatInputComponent } from '@/ui/chat/chat-input.component';
import { ChatSessionController } from '@/ui/chat/chat-session-controller';
import { openingSession } from '@/features/chat';
import { MentionSuggest } from '@/ui/suggest/mention-suggest';
import { internalLinktextFromEvent, triggerHoverLink } from '@/ui/chat/hover-link';
import { RagStatusPanel } from '@/ui/chat/rag-status-panel';
import { resolveMessageProviderId } from '@/ui/chat/utils/provider-utils';
import { providerAvatar, providerColor } from '@/ui/provider-meta';
import { TestIds } from '@/ui/utils/test-ids';
import type { AppServices } from '@/ui/app-services';
import { applyWriteProposal, type BatchWriteProposal, type WriteProposal } from '@/features/agent';
import { describeProposal } from '@/ui/chat/write-proposal-cards';
import { errorMessage } from '@/core/utils/errors';

export const CHAT_VIEW_TYPE = 'intelligence-assistant-chat';

export class ChatView extends ItemView {
	private readonly state = new ChatViewState();
	private readonly inputController: InputController;
	private readonly chatController: ChatController;
	private conversationManager: ConversationManager;
	private chatHeader: ChatHeaderComponent;
	private chatInput: ChatInputComponent;
	private session: ChatSessionController;
	private messageList: ChatMessageList;
	private mentionSuggest: MentionSuggest | null = null;
	private conversationListContainer: HTMLElement;
	private pendingAgentTask: { prompt: string; displayText: string } | null = null;
	private services: AppServices;
	private ragStatusPanel: RagStatusPanel;

	constructor(leaf: WorkspaceLeaf, private readonly plugin: IntelligenceAssistantPlugin) {
		super(leaf);
		this.inputController = new InputController(this.app, this.plugin, this.state);
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
			onShowCapabilities: () => new AgentCapabilityModal(this.app, this.capabilitySummary(this.state.referencedFiles)).open(),
			onNewChat: async () => {
				await this.session.startNewChat();
				await this.conversationManager.createNewConversation();
			}
		});

		this.messageList = new ChatMessageList(mainChatContainer, this.app, this.plugin, this.state, this.rendererCallbacks());
		this.renderScrollToBottom(mainChatContainer);

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
				new Notice(t('chat.notices.stopping'));
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
			new Notice(t('chat.notices.ragInitError', { message: errorMessage(error) }));
		}

		void this.inputController.initialize();
		void this.chatController.initialize();
		this.inputController.setInputElement(this.chatInput.textarea);
		this.inputController.setAttachmentPreviewElement(this.chatInput.attachmentContainer);

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
			this.state.availableModels = await ModelManager.getAllAvailableModels(this.plugin.settings.llmConfigs);
			this.chatInput.updateModelOptions();

			const available = (id: string | undefined) => Boolean(id) && this.state.availableModels.some(model => model.id === id);
			if (available(previousSelection)) {
				select.value = previousSelection;
			} else if (available(this.plugin.settings.defaultModel)) {
				select.value = this.plugin.settings.defaultModel;
			}

			await this.session.refreshImageButton();
			if (showNotice) {
				new Notice(t('chat.notices.modelsRefreshed'));
			}
		} catch (error) {
			console.error('Failed to refresh models:', error);
			if (showNotice) {
				new Notice(t('chat.notices.modelsRefreshFailed', { message: errorMessage(error) }));
			}
		}
	}

	public async startAgentTask(options: {
		prompt: string;
		displayText?: string;
		references?: Array<TFile | TFolder>;
		newConversation?: boolean;
		sendImmediately?: boolean;
	}): Promise<void> {
		const prompt = options.prompt.trim();
		if (!prompt) return;
		const displayText = (options.displayText?.trim() || prompt).trim();

		if (options.newConversation) {
			await this.conversationManager.createNewConversation();
		}
		if (this.state.mode !== 'agent') {
			await this.session.changeMode('agent');
		}

		addReferences(this.state, options.references ?? []);
		this.chatInput.updateReferenceDisplay();

		this.pendingAgentTask = { prompt, displayText };
		this.inputController.setInputValue(displayText);
		this.chatInput.textarea.dispatchEvent(new Event('input', { bubbles: true }));
		this.chatInput.textarea.focus();

		if (options.sendImmediately) {
			this.messageList.showPreflight(displayText, this.capabilitySummary(options.references ?? []).preflightItems);
			await this.sendMessage(displayText);
		}
	}

	async onClose() {
		this.mentionSuggest?.close();
		void this.inputController?.cleanup();
		void this.chatController?.cleanup();
		await this.plugin.saveSettings();
	}

	private async sendMessage(text: string) {
		const pendingTask = this.pendingAgentTask;
		this.pendingAgentTask = null;
		const usePendingTask = pendingTask !== null && this.state.mode === 'agent' && text.trim() === pendingTask.displayText.trim();
		await this.chatController.sendMessage(text, usePendingTask ? { llmContentOverride: pendingTask.prompt } : undefined);
	}

	private rendererCallbacks(): MessageRendererCallbacks {
		return {
			saveMessageToNewNote: (message) => this.services.vaultExport.saveToNewNote(message),
			insertMessageToNote: (message) => this.services.vaultExport.insertIntoNote(message),
			regenerateMessage: (message, element) => this.chatController.regenerateMessage(message, element),
			displayRagSources: (container, message) => this.ragStatusPanel.displaySources(container, message.ragSources ?? []),
			getProviderAvatar: (message) => message.role === 'user' ? '🧑' : providerAvatar(resolveMessageProviderId(message, this.plugin)),
			getProviderColor: (message) => providerColor(resolveMessageProviderId(message, this.plugin)),
			applyWriteProposal: (proposal) => this.confirmAndApplyProposal(proposal),
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
				this.inputController.clearInput();
				this.chatInput.textarea.dispatchEvent(new Event('input', { bubbles: true }));
				this.chatInput.updateAttachmentPreview();
				this.chatInput.updateReferenceDisplay();
			},
			addMessageToUI: (message: Message) => this.messageList.add(message),
			updateTokenSummary: () => this.updateTokenSummary(),
			findMessageContentElement: (element: HTMLElement) => this.messageList.contentOf(element),
			findMessageBodyElement: (element: HTMLElement) => this.messageList.bodyOf(element),
			onStreamingStateChange: (isStreaming: boolean) => {
				this.chatInput.stopBtn?.toggleClass('ia-hidden', !isStreaming);
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
		const button = parent.createDiv('ia-scroll-to-bottom ia-hidden');
		setIcon(button, 'arrow-down');
		button.setAttribute('aria-label', 'Scroll to bottom');
		button.addEventListener('click', () => {
			this.messageList.scrollToEnd();
			button.addClass('ia-hidden');
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
	}

	private capabilitySummary(references: Array<TFile | TFolder>) {
		return this.session.capabilitySummary(this.services.tools.registry, references);
	}

	private async confirmAndApplyProposal(proposal: WriteProposal | BatchWriteProposal): Promise<boolean> {
		const summary = describeProposal(proposal);
		if (!await showConfirm(this.app, `Apply ${summary}?`)) return false;
		await applyWriteProposal(this.app, proposal);
		new Notice(`Applied ${summary}`);
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
