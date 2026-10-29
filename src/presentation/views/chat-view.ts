import { ItemView, WorkspaceLeaf, Notice, TFile, TFolder, setIcon } from 'obsidian';
import { t } from '@/i18n';
import { showConfirm } from '@/presentation/components/modals/confirm-modal';
import { SearchableReferenceModal } from '@/presentation/components/modals/searchable-reference-modal';
import { SearchableImageModal } from '@/presentation/components/modals/searchable-image-modal';
import { AgentCapabilityModal } from '@/presentation/components/modals/agent-capability-modal';
import type IntelligenceAssistantPlugin from '@plugin';
import type { Message, Conversation } from '@/types';
import {
	buildAgentCapabilitySummary,
	resolveAgentToolsForAgent,
	type AgentCapabilitySummary,
	type CapabilityReference,
} from '@/application/agents/agent-capability-summary';
import { ModelManager } from '@qwai/obsidian-llm';
import { ChatViewState } from '@/presentation/state/chat-view-state';
import { ConversationManager } from '@/presentation/components/chat/managers/conversation-manager';
import { renderMessage, MessageRendererCallbacks } from '@/presentation/components/chat/message-renderer';
import { hasAgentToolCall, extractFinalContent, reconstructAgentSteps } from '@/presentation/components/chat/handlers/tool-call-handler';
import { InputController } from '@/presentation/components/chat/controllers/input-controller';
import { ChatController } from '@/presentation/components/chat/controllers/chat-controller';
import { ChatHeaderComponent } from '@/presentation/components/chat/chat-header.component';
import { ChatInputComponent } from '@/presentation/components/chat/chat-input.component';
import { ChatSessionController } from '@/presentation/components/chat/chat-session-controller';
import { openingSession } from '@/application/services/chat-session-policy';
import { MentionSuggest } from '@/presentation/suggest/mention-suggest';
import { internalLinktextFromEvent, triggerHoverLink } from '@/presentation/chat/hover-link';
import { RagStatusPanel } from '@/presentation/components/chat/rag-status-panel';
import { resolveMessageProviderId } from '@/presentation/components/chat/utils/provider-utils';
import { providerAvatar, providerColor } from '@/presentation/components/provider-meta';
import { TestIds } from '@/presentation/utils/test-ids';
import type { AppServices } from '@/presentation/app-services';
import {
	applyWriteProposal as applyWriteProposalToVault,
	type WriteProposal,
} from '@/application/services/write-proposal-service';

export const CHAT_VIEW_TYPE = 'intelligence-assistant-chat';

export class ChatView extends ItemView {
	// Centralized state management
	private state: ChatViewState;

	// Managers
	private conversationManager: ConversationManager;
	private chatHeader: ChatHeaderComponent;
	private chatInput: ChatInputComponent;
	private session: ChatSessionController;
	private mentionSuggest: MentionSuggest | null = null;

	// Controllers
	private inputController: InputController;
	private chatController: ChatController;

	private plugin: IntelligenceAssistantPlugin;
	private chatContainer: HTMLElement;
	private scrollToBottomBtn: HTMLElement;
	public modelSelect: HTMLSelectElement; // Public so it can be accessed by DocumentGrader

	private conversationListContainer: HTMLElement;
	private mainChatContainer: HTMLElement;
	private attachmentContainer: HTMLElement | null = null;
	private ragActionItem: HTMLElement | null = null;
	private webActionItem: HTMLElement | null = null;
	private pendingAgentTask: { prompt: string; displayText: string } | null = null;

	private services: AppServices;
	private ragStatusPanel: RagStatusPanel;

	// UI elements
	private stopBtn: HTMLElement | null = null;
	constructor(leaf: WorkspaceLeaf, plugin: IntelligenceAssistantPlugin) {
		super(leaf);
		this.plugin = plugin;

		// Initialize state management
		this.state = new ChatViewState();

		// Initialize controllers
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
		this.state.mode = opening.mode;
		this.plugin.settings.activeAgentId = opening.activeAgentId;
		await this.plugin.saveSettings();

		// Create main layout with floating sidebar
		const mainLayout = container.createDiv('chat-main-layout');

		// Main chat container (full width)
		this.mainChatContainer = mainLayout.createDiv('main-chat-area');

		// Floating conversation list sidebar (hidden by default)
		this.conversationListContainer = mainLayout.createDiv('conversation-list-floating');
		this.conversationListContainer.setAttribute('data-testid', TestIds.chat.conversationList);
		this.conversationListContainer.addClass('is-collapsed');

		// Initialize Chat Header Component
		this.chatHeader = new ChatHeaderComponent(
			this.mainChatContainer,
			this.plugin,
			{
				onToggleConversations: () => this.toggleConversationListVisibility(),
				onShowCapabilities: () => this.showAgentCapabilities(),
				onNewChat: async () => {
					await this.session.startNewChat();
					await this.conversationManager.createNewConversation();
				}
			}
		);

		// Chat messages container
		this.chatContainer = this.mainChatContainer.createDiv('chat-messages');
		this.chatContainer.setAttribute('data-testid', TestIds.chat.messageList);

		// Floating scroll-to-bottom button
		this.scrollToBottomBtn = this.mainChatContainer.createDiv('ia-scroll-to-bottom');
		this.scrollToBottomBtn.addClass('ia-hidden');
		setIcon(this.scrollToBottomBtn, 'arrow-down');
		this.scrollToBottomBtn.setAttribute('aria-label', 'Scroll to bottom');
		this.scrollToBottomBtn.addEventListener('click', () => {
			this.chatContainer.scrollTo({ top: this.chatContainer.scrollHeight, behavior: 'smooth' });
			this.scrollToBottomBtn.addClass('ia-hidden');
		});

		// Initialize Chat Input Component
		this.chatInput = new ChatInputComponent(
			this.mainChatContainer,
			this.app,
			this.plugin,
			this.state,
			{
				onSendMessage: async (text) => await this.sendMessage(text),
				onAttachImage: () => {
					this.attachImage();
					return Promise.resolve();
				},
				onToggleRag: () => this.session.toggleRag(),
				onToggleWeb: () => this.session.toggleWebSearch(),
				onShowReferenceMenu: () => this.showReferenceMenu(),
				onStopStreaming: () => {
					this.state.stopRun();
					if (this.stopBtn) this.stopBtn.addClass('ia-hidden');
					new Notice(t('chat.notices.stopping'));
				},
				onModeChange: (mode) => this.session.changeMode(mode),
				onModelChange: () => this.session.refreshImageButton(),
				onAgentChange: (agentId) => this.session.selectAgent(agentId)
			}
		);
		this.session = new ChatSessionController(this.plugin, this.state, {
			input: this.chatInput,
			header: this.chatHeader,
			refreshRagStatus: () => this.updateRagStatus(),
		});

		// Redirect property references
		this.attachmentContainer = this.chatInput.attachmentContainer;
		this.ragActionItem = this.chatInput.ragActionItem;
		this.webActionItem = this.chatInput.webActionItem;
		this.stopBtn = this.chatInput.stopBtn;
		this.modelSelect = this.chatInput.modelSelect;

		// @-mention / [[wikilink autocomplete on the chat input. Picking a note also
		// attaches it as a reference so the agent receives the note's content, not
		// just an opaque `[[link]]`.
		this.mentionSuggest = new MentionSuggest(this.app, this.chatInput.textarea, (file) => {
			if (!this.state.referencedFiles.some(item => item.path === file.path)) {
				this.state.addReferencedFile(file);
				this.updateReferenceDisplay();
			}
		});

		await this.refreshModels();

		// Set default model if configured
		if (this.plugin.settings.defaultModel && this.modelSelect.value === '') {
			this.modelSelect.value = this.plugin.settings.defaultModel;
		}

		await this.session.refreshOptions();

		// Add click-outside handler to hide conversation list
		this.registerDomEvent(activeDocument, 'click', (e: MouseEvent) => {
			// Only hide if not pinned and currently visible
			if (!this.state.conversationListPinned && this.state.conversationListVisible) {
				const target = e.target as HTMLElement;
				// Check if click is outside conversation list
				if (!this.conversationListContainer.contains(target)) {
					this.state.conversationListVisible = false;
					this.conversationListContainer.removeClass('is-open');
					this.conversationListContainer.addClass('is-collapsed');
				}
			}
		});

		// Hover previews for internal links in chat replies: on mouseover of an
		// `a.internal-link`, fire the workspace `hover-link` trigger so Obsidian
		// renders its native HoverPopover (we registered as a hover-link source in
		// the plugin onload). Delegated so it covers links added by future renders.
		this.registerDomEvent(this.chatContainer, 'mouseover', (event: MouseEvent) => {
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

		try {
			await this.updateRagStatus();
		} catch (_error) {
			const err = _error instanceof Error ? _error : new Error(String(_error));
			console.error('Error initializing RAG:', err);
			new Notice(t('chat.notices.ragInitError', { message: err.message }));
		}

		void this.inputController.initialize();
		void this.chatController.initialize();

		this.inputController.setInputElement(this.chatInput.textarea);
		this.inputController.setAttachmentPreviewElement(this.attachmentContainer);

		// Initialize conversation manager
		this.conversationManager = new ConversationManager(
			this.app,
			this.plugin,
			this.services.conversations,
			this.services.namer,
			this.state,
			this.chatContainer,
			this.modelSelect,
			(messages: Message[]) => this.renderMessageList(messages),
			() => this.updateTokenSummary()
		);
		void this.conversationManager.initializeContainer(this.conversationListContainer);

		// Configure chat controller with full pipeline options (after conversationManager is set up)
		this.chatController.configure({
			chatContainer: this.chatContainer,
			chatService: this.services.chat,
			conversationManager: this.conversationManager,
			ragStatusPanel: this.ragStatusPanel,
			getSelectedModel: () => this.modelSelect?.value ?? '',
			clearInputUI: () => {
				this.inputController.clearInput();
				if (this.chatInput) {
					this.chatInput.textarea.dispatchEvent(new Event('input', { bubbles: true }));
					this.chatInput.updateAttachmentPreview();
					this.chatInput.updateReferenceDisplay();
				}
			},
			addMessageToUI: (message: Message) => this.addMessageToUI(message),
			updateTokenSummary: () => this.updateTokenSummary(),
			findMessageContentElement: (el: HTMLElement) => this.findMessageContentElement(el),
			findMessageBodyElement: (el: HTMLElement) => this.findMessageBodyElement(el),
			onStreamingStateChange: (isStreaming: boolean) => {
				if (isStreaming) {
					if (this.stopBtn) this.stopBtn.removeClass('ia-hidden');
				} else {
					if (this.stopBtn) this.stopBtn.addClass('ia-hidden');
				}
				if (isStreaming) {
					this.services.activity.begin();
				} else {
					this.services.activity.end();
				}
			},
		});
		this.conversationManager.on('conversation-loaded', (conv: Conversation) => {
			this.chatHeader.updateConversationTitle(conv.title);
			void this.session.applyConversation(conv);
		});
		this.conversationManager.on('conversation-created', (conv: Conversation) => {
			this.chatHeader.updateConversationTitle(conv.title);
			void this.session.applyConversation(conv);
		});
		this.conversationManager.on('conversation-updated', (conv: Conversation) => {
			if (conv.id === this.state.currentConversationId) {
				this.chatHeader.updateConversationTitle(conv.title);
			}
		});

		// Load or create initial conversation
		await this.conversationManager.loadOrCreateConversation();
	}

	public async refreshModels(showNotice: boolean = false) {
		try {
			const previousSelection = this.modelSelect?.value ?? '';

			// Get all available models from configured providers (uses stored models by default)
			this.state.availableModels = await ModelManager.getAllAvailableModels(this.plugin.settings.llmConfigs);

			this.chatInput.updateModelOptions();

			// Restore selection if possible, otherwise fall back to default
			if (this.modelSelect) {
				if (previousSelection && this.state.availableModels.some(m => m.id === previousSelection)) {
					this.modelSelect.value = previousSelection;
				} else if (this.plugin.settings.defaultModel && this.state.availableModels.some(m => m.id === this.plugin.settings.defaultModel)) {
					this.modelSelect.value = this.plugin.settings.defaultModel;
				}
			}

			await this.session.refreshImageButton();

			if (showNotice) {
				new Notice(t('chat.notices.modelsRefreshed'));
			}
		} catch (_error) {
			const err = _error instanceof Error ? _error : new Error(String(_error));
			console.error('Failed to refresh models:', err);
			if (showNotice) {
				new Notice(t('chat.notices.modelsRefreshFailed', { message: err.message }));
			}
		}
	}

	private async sendMessage(text: string) {
		const pendingTask = this.pendingAgentTask;
		const trimmedText = text.trim();
		const shouldUsePendingTask = pendingTask !== null &&
			this.state.mode === 'agent' &&
			trimmedText === pendingTask.displayText.trim();
		this.pendingAgentTask = null;
		await this.chatController.sendMessage(
			text,
			shouldUsePendingTask ? { llmContentOverride: pendingTask.prompt } : undefined
		);
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

		for (const reference of options.references ?? []) {
			if (!this.state.referencedFiles.some(item => item.path === reference.path)) {
				this.state.addReferencedFile(reference);
			}
		}
		this.updateReferenceDisplay();

		this.pendingAgentTask = { prompt, displayText };
		this.inputController.setInputValue(displayText);
		this.chatInput.textarea.dispatchEvent(new Event('input', { bubbles: true }));
		this.chatInput.textarea.focus();

		if (options.sendImmediately) {
			this.renderAgentTaskPreflight(displayText, options.references ?? []);
			await this.sendMessage(displayText);
		}
	}

	private addMessageToUI(message: Message): HTMLElement {
		const callbacks: MessageRendererCallbacks = {
					saveMessageToNewNote: this.saveMessageToNewNote.bind(this) as (message: Message) => Promise<void>,
					insertMessageToNote: this.insertMessageToNote.bind(this) as (message: Message) => Promise<void>,
					regenerateMessage: this.regenerateMessage.bind(this) as (message: Message, element: HTMLElement) => Promise<void>,
					displayRagSources: (container: HTMLElement, message: Message) => this.displayRagSources(container, message.ragSources ?? []),
					getProviderAvatar: (message: Message) => message.role === 'user' ? '🧑' : providerAvatar(resolveMessageProviderId(message, this.plugin)),
					getProviderColor: (message: Message) => providerColor(resolveMessageProviderId(message, this.plugin)),
					applyWriteProposal: (proposal: WriteProposal) => this.applyWriteProposal(proposal)
		};

		const options = {
			app: this.app,
			plugin: this.plugin,
			mode: this.state.mode,
			messages: this.state.messages
		};

		// Remove empty state if present
		const emptyState = this.chatContainer.querySelector('.ia-chat-empty-state');
		if (emptyState) emptyState.remove();

		return renderMessage(this.chatContainer, message, options, callbacks, { animate: true });
	}

	private renderEmptyState(): void {
		// Only show if chat container is empty
		if (this.chatContainer.querySelector('.ia-chat-message') || this.chatContainer.querySelector('.ia-chat-empty-state')) {
			return;
		}

		const emptyEl = this.chatContainer.createDiv('ia-chat-empty-state');
		emptyEl.setAttribute('data-testid', TestIds.chat.emptyState);

		const iconEl = emptyEl.createDiv('ia-chat-empty-state__icon');
		setIcon(iconEl, 'message-square');

		emptyEl.createEl('h3', { text: t('chat.emptyHeading'), cls: 'ia-chat-empty-state__heading' });
		emptyEl.createEl('p', {
			text: t('chat.emptySubtext'),
			cls: 'ia-chat-empty-state__subtext'
		});
	}

	/**
	 * Render a list of messages, grouping agent tool-call chains into a single
	 * collapsed Execution Process trace + final answer bubble.
	 */
	private renderMessageList(messages: Message[]): void {
		let i = 0;
		while (i < messages.length) {
			const msg = messages[i];

			if (msg.role === 'assistant' && hasAgentToolCall(msg.content)) {
				// Collect consecutive assistant + system messages into a chain
				// System messages contain tool results ("Tool X result: ...")
				const chain: Message[] = [msg];
				let j = i + 1;
				while (j < messages.length) {
					const next = messages[j];
					if (next.role === 'system' && next.content.startsWith('Tool ')) {
						chain.push(next);
						j++;
					} else if (next.role === 'assistant') {
						chain.push(next);
						j++;
						if (!hasAgentToolCall(next.content)) {
							break; // Just collected the final answer
						}
					} else {
						break;
					}
				}

				// Separate tool-call messages from the final answer
				const lastMsg = chain[chain.length - 1];
				const lastHasToolCall = hasAgentToolCall(lastMsg.content);
				const traceMessages = lastHasToolCall ? chain : chain.slice(0, -1);
				const finalContent = lastHasToolCall ? extractFinalContent(lastMsg) : lastMsg.content;

				// Use saved execution steps if available, otherwise reconstruct
				const savedSteps = chain.find(m => m.agentExecutionSteps?.length)?.agentExecutionSteps;
				const steps = savedSteps ?? reconstructAgentSteps(traceMessages);

				// Render as a single message with execution trace + final answer
				const syntheticMsg: Message = {
					...lastMsg,
					content: finalContent,
					agentExecutionSteps: steps
				};
				this.addMessageToUI(syntheticMsg);
				i = j;
			} else if (msg.role === 'system') {
				// Skip system messages (tool results) that aren't part of an agent chain
				i++;
			} else {
				this.addMessageToUI(msg);
				i++;
			}
		}

		// Show empty state if no messages were rendered
		if (messages.length === 0) {
			this.renderEmptyState();
		}
	}

	private showReferenceMenu() {
		new SearchableReferenceModal(this.app, (selectedItems: (TFile | TFolder)[]) => {
			selectedItems.forEach(item => {
				if (!this.state.referencedFiles.some(ref => ref.path === item.path)) {
					this.state.referencedFiles.push(item);
				}
			});
			this.updateReferenceDisplay();
			if (selectedItems.length > 0) {
				new Notice(t('chat.notices.referencesAdded', { count: selectedItems.length }));
			}
		}).open();
	}

	private updateReferenceDisplay() {
		this.chatInput.updateReferenceDisplay();
	}

	private updateAttachmentPreview() {
		this.chatInput.updateAttachmentPreview();
	}

	private async regenerateMessage(message: Message, messageEl?: HTMLElement) {
		await this.chatController.regenerateMessage(message, messageEl);
	}

	private saveMessageToNewNote(message: Message) {
		void this.services.vaultExport.saveToNewNote(message);
	}

	private insertMessageToNote(message: Message) {
		void this.services.vaultExport.insertIntoNote(message);
	}

	private async applyWriteProposal(proposal: WriteProposal): Promise<void> {
		const confirmed = await showConfirm(
			this.app,
			`Apply ${proposal.operation} proposal for ${proposal.path}?`
		);
		if (!confirmed) return;

		await applyWriteProposalToVault(this.app, proposal);
		new Notice(`Applied proposal: ${proposal.path}`);
	}

	private displayRagSources(messageBody: HTMLElement, ragSources: import('@/types').RAGSource[]): void {
		this.ragStatusPanel.displaySources(messageBody, ragSources);
	}
	
	private async updateRagStatus(target?: HTMLElement | null) {
		await this.ragStatusPanel.updateStatus(target ?? this.ragActionItem);
	}

	/**
	 * Calculate and update the total token usage summary for the conversation
	 */
	private updateTokenSummary() {
		let total = 0;
		for (const msg of this.state.messages) {
			if (msg.role === 'assistant' && msg.tokenUsage) {
				total += msg.tokenUsage.totalTokens || 0;
			}
		}
		this.chatHeader.updateTokenSummary(total);
	}

	private showAgentCapabilities(): void {
		new AgentCapabilityModal(this.app, this.buildCurrentCapabilitySummary()).open();
	}

	private buildCurrentCapabilitySummary(references: Array<TFile | TFolder> = this.state.referencedFiles): AgentCapabilitySummary {
		const activeAgent = this.session.activeAgent();
		const tools = resolveAgentToolsForAgent(this.services.tools.registry, activeAgent);
		return buildAgentCapabilitySummary({
			mode: this.state.mode,
			agent: activeAgent,
			tools,
			ragConfigured: this.plugin.settings.ragConfig.enabled,
			ragActive: this.session.ragActive(),
			webSearchConfigured: this.plugin.settings.webSearchConfig.enabled,
			webSearchActive: this.session.webSearchActive(),
			references: references.map(ref => this.toCapabilityReference(ref)),
		});
	}

	private toCapabilityReference(reference: TFile | TFolder): CapabilityReference {
		return {
			type: reference instanceof TFile ? 'file' : 'folder',
			path: reference.path,
			name: reference.name,
		};
	}

	private renderAgentTaskPreflight(taskTitle: string, references: Array<TFile | TFolder>): void {
		if (!this.chatContainer) return;

		const emptyState = this.chatContainer.querySelector('.ia-chat-empty-state');
		if (emptyState) emptyState.remove();

		const summary = this.buildCurrentCapabilitySummary(references);
		const card = this.chatContainer.createDiv('ia-agent-preflight-card');
		card.createDiv({ cls: 'ia-agent-preflight-card__eyebrow', text: 'Agent task preflight' });
		card.createDiv({ cls: 'ia-agent-preflight-card__title', text: taskTitle });
		const list = card.createDiv('ia-agent-preflight-card__items');
		for (const item of summary.preflightItems) {
			list.createSpan({ cls: 'ia-agent-preflight-card__item', text: item });
		}
		this.chatContainer.scrollTo({ top: this.chatContainer.scrollHeight, behavior: 'smooth' });
	}

	private async toggleConversationListVisibility() {
		if (this.conversationManager) {
			await this.conversationManager.toggleConversationList();
			return;
		}

		if (!this.conversationListContainer) return;
		const isVisible = !this.conversationListContainer.hasClass('is-collapsed');
		if (isVisible) {
			this.conversationListContainer.removeClass('is-open');
			this.conversationListContainer.addClass('is-collapsed');
		} else {
			this.conversationListContainer.removeClass('is-collapsed');
			this.conversationListContainer.addClass('is-open');
		}
	}

	private findMessageBodyElement(messageEl: HTMLElement): HTMLElement | null {
		return this.queryMessageElement(messageEl, ['[data-message-body]', '.ia-chat-message__body', '.message-body']);
	}

	private findMessageContentElement(messageEl: HTMLElement): HTMLElement | null {
		return this.queryMessageElement(messageEl, ['[data-message-content]', '.ia-chat-message__content', '.message-content']);
	}

	private queryMessageElement(messageEl: HTMLElement, selectors: string[]): HTMLElement | null {
		for (const selector of selectors) {
			const el = messageEl.querySelector(selector);
			if (el instanceof HTMLElement) {
				return el;
			}
		}
		return null;
	}

	private attachImage() {
		new SearchableImageModal(this.app, (selectedFiles: TFile[]) => {
			void (async () => {
				for (const file of selectedFiles) {
					const arrayBuffer = await this.app.vault.readBinary(file);
					const base64 = this.arrayBufferToBase64(arrayBuffer);
					const dataUrl = `data:image/${file.extension};base64,${base64}`;

					this.state.currentAttachments.push({
						type: 'image',
						name: file.name,
						path: file.path,
						content: dataUrl
					});
				}
				this.updateAttachmentPreview();
				if (selectedFiles.length > 0) {
					new Notice(t('chat.notices.attachedImages', { count: selectedFiles.length }));
				}
			})();
		}).open();
	}

	private arrayBufferToBase64(buffer: ArrayBuffer): string {
		let binary = '';
		const bytes = new Uint8Array(buffer);
		for (let i = 0; i < bytes.byteLength; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return window.btoa(binary);
	}

	async onClose() {
		this.mentionSuggest?.close();
		void this.inputController?.cleanup();
		void this.chatController?.cleanup();
		await this.plugin.saveSettings();
	}
}
	
