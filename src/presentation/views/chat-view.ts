import { ItemView, WorkspaceLeaf, Notice, Menu, TFile, TFolder, setIcon } from 'obsidian';
import { t } from '@/i18n';
import { showConfirm } from '@/presentation/components/modals/confirm-modal';
import { SearchableReferenceModal } from '@/presentation/components/modals/searchable-reference-modal';
import { SearchableImageModal } from '@/presentation/components/modals/searchable-image-modal';
import { AgentCapabilityModal } from '@/presentation/components/modals/agent-capability-modal';
import type IntelligenceAssistantPlugin from '@plugin';
import { DEFAULT_AGENT_ID } from '@/constants';
import type {Message, Conversation, ConversationConfig, Agent} from '@/types';
import {
	buildAgentCapabilitySummary,
	resolveAgentToolsForAgent,
	type AgentCapabilitySummary,
	type CapabilityReference,
} from '@/application/agents/agent-capability-summary';
import { ModelManager } from '@/infrastructure/llm/model-manager';
import { marked } from 'marked';
import {
	WebSearchService,
	ChatService,
	AgentMemoryService
} from '@/application/services';
import { AgentEngineLoop, AgentSenseService, HistoryCompactor, ObsidianAgentRunStateStore } from '@/application/agents';
import { RAGManager } from '@/infrastructure/rag-manager';
import { ProviderFactory } from '@/infrastructure/llm/provider-factory';
import { VaultExportService } from '@/application/services/vault-export-service';
import { ChatViewState } from '@/presentation/state/chat-view-state';
import { ConversationManager } from '@/presentation/components/chat/managers/conversation-manager';
import { renderMessage, MessageRendererCallbacks } from '@/presentation/components/chat/message-renderer';
import { updateExecutionTrace, createAgentExecutionTraceContainer, hasAgentToolCall, extractFinalContent, reconstructAgentSteps } from '@/presentation/components/chat/handlers/tool-call-handler';
import {
	MessageController,
	AgentController,
	InputController,
	ChatController
} from '@/presentation/components/chat/controllers';
import { ChatHeaderComponent } from '@/presentation/components/chat/chat-header.component';
import { ChatInputComponent } from '@/presentation/components/chat/chat-input.component';
import { RagStatusPanel } from '@/presentation/components/chat/rag-status-panel';
import { resolveMessageProviderId } from '@/presentation/components/chat/utils';
import { ObsidianFileSystem } from '@/infrastructure/obsidian/obsidian-file-system';
import { ObsidianHttpClient } from '@/infrastructure/obsidian/obsidian-http-client';
import { TestIds } from '@/presentation/utils/test-ids';
import { } from '@/presentation/components/utils/dom-helpers';
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

	// Controllers
	private messageController: MessageController;
	private agentController: AgentController;
	private inputController: InputController;
	private chatController: ChatController;

	private plugin: IntelligenceAssistantPlugin;
	private chatContainer: HTMLElement;
	private scrollToBottomBtn: HTMLElement;
	private inputContainer: HTMLElement;
	public modelSelect: HTMLSelectElement; // Public so it can be accessed by DocumentGrader

	private conversationListContainer: HTMLElement;
	private mainChatContainer: HTMLElement;
	private attachmentContainer: HTMLElement | null = null;
	private referenceContainer: HTMLElement | null = null;
	private ragActionItem: HTMLElement | null = null;
	private webActionItem: HTMLElement | null = null;
	private imageActionItem: HTMLElement | null = null;
	private pendingAgentTask: { prompt: string; displayText: string } | null = null;

	// Services
	private ragManager: RAGManager;
	private webSearchService: WebSearchService;
	private chatService: ChatService;
	private vaultExportService: VaultExportService;
	private ragStatusPanel: RagStatusPanel;

	// UI elements
	private stopBtn: HTMLElement | null = null;
	constructor(leaf: WorkspaceLeaf, plugin: IntelligenceAssistantPlugin) {
		super(leaf);
		this.plugin = plugin;

		// Initialize state management
		this.state = new ChatViewState();

		// Initialize controllers
		this.messageController = new MessageController(this.app, this.plugin, this.state);
		this.agentController = new AgentController(this.app, this.plugin, this.state);
		this.inputController = new InputController(this.app, this.plugin, this.state);
		this.chatController = new ChatController(this.app, this.plugin, this.state);

		this.ragManager = this.plugin.getRAGManager();

		this.webSearchService = new WebSearchService(this.plugin.settings.webSearchConfig, new ObsidianHttpClient());
		const agentMemoryRepository = this.plugin.getAgentMemoryRepository();
		const agentMemoryService = agentMemoryRepository ? new AgentMemoryService(agentMemoryRepository) : undefined;
		const senseService = new AgentSenseService(this.app, this.ragManager, agentMemoryService);
		const tokenUsageRepo = this.plugin.tokenUsageRepo;
		const agentEngineLoop = new AgentEngineLoop({
			app: this.app,
			toolRegistry: this.plugin.getToolRegistry(),
			senseService,
			historyCompactor: new HistoryCompactor(),
			webSearchService: this.webSearchService,
			ragManager: this.ragManager,
			agentRunStateStore: new ObsidianAgentRunStateStore(this.app),
			createProvider: (modelId) => {
				const config = ModelManager.findConfigForModelByProvider(modelId, this.plugin.settings.llmConfigs);
				return config ? { provider: ProviderFactory.createProvider(config), providerId: config.provider } : null;
			},
			recordUsage: tokenUsageRepo
				? async (record) => {
					await tokenUsageRepo.recordUsage(record);
					// Refresh the status bar so cumulative token usage stays live.
					this.plugin.refreshStatusBar();
				}
				: undefined,
			defaultModel: this.plugin.settings.defaultModel,
		});
		this.chatService = new ChatService(
			new ObsidianFileSystem(this.app),
			this.ragManager,
			this.webSearchService,
			this.plugin.settings.llmConfigs,
			this.plugin.tokenUsageRepo ?? undefined,
			this.plugin.settings.defaultModel,
			agentEngineLoop
		);
		this.vaultExportService = new VaultExportService(this.app);
		this.ragStatusPanel = new RagStatusPanel(
			this.app,
			this.ragManager,
			() => this.state.enableRAG,
			() => this.state.mode,
			() => this.plugin.settings.ragConfig
		);
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
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('intelligence-assistant-chat-container');
		container.setAttribute('data-testid', TestIds.chat.container);

		const configuredMode = this.plugin.settings.defaultChatMode ?? 'chat';
		this.state.mode = configuredMode === 'agent' ? 'agent' : 'chat';

		if (this.state.mode === 'agent') {
			const ensuredAgentId = this.ensureDefaultAgentSelection();
			if (ensuredAgentId) {
				if (this.plugin.settings.activeAgentId !== ensuredAgentId) {
					this.plugin.settings.activeAgentId = ensuredAgentId;
					await this.plugin.saveSettings();
				}
			} else {
				this.state.mode = 'chat';
			}
		}

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
			this.state,
			{
				onToggleConversations: () => this.toggleConversationListVisibility(),
				onShowCapabilities: () => this.showAgentCapabilities(),
				onNewChat: async () => {
					await this.resetToDefaultChatConfiguration();
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
				onToggleRag: async () => await this.handleQuickActionRag(),
				onToggleWeb: async () => await this.handleQuickActionWeb(),
				onShowReferenceMenu: () => this.showReferenceMenu(),
				onStopStreaming: () => {
					this.state.stopStreamingRequested = true;
					if (this.stopBtn) this.stopBtn.addClass('ia-hidden');
					new Notice(t('chat.notices.stopping'));
				},
				onModeChange: (mode) => this.handleModeChange(mode),
				onModelChange: () => this.onModelChange(),
				onAgentChange: (agentId) => this.handleAgentSelection(agentId)
			}
		);

		// Redirect property references
		this.inputContainer = this.chatInput.inputContainer;
		this.referenceContainer = this.chatInput.referenceContainer;
		this.attachmentContainer = this.chatInput.attachmentContainer;
		this.ragActionItem = this.chatInput.ragActionItem;
		this.webActionItem = this.chatInput.webActionItem;
		this.imageActionItem = this.chatInput.imageActionItem;
		this.stopBtn = this.chatInput.stopBtn;
		this.modelSelect = this.chatInput.modelSelect;

		await this.refreshModels();

		// Set default model if configured
		if (this.plugin.settings.defaultModel && this.modelSelect.value === '') {
			this.modelSelect.value = this.plugin.settings.defaultModel;
		}

		// Update image button visibility based on the selected model's vision capability
		await this.updateImageButtonVisibility();

		// Initialize MCP servers
		this.initializeMCPServers();

		await this.updateOptionsDisplay();

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

		// Always initialize RAG manager to load existing data from storage for status display
		// This ensures the status shows correctly even when RAG is not enabled for search
		try {
			this.ragManager.updateConfig(this.plugin.settings.ragConfig);
			await this.ragManager.initialize();
			
			// Update RAG status after initialization completes
			await this.updateRagStatus();
		} catch (_error) {
			const err = _error instanceof Error ? _error : new Error(String(_error));
			console.error('Error initializing RAG:', err);
			new Notice(t('chat.notices.ragInitError', { message: err.message }));
		}

		// Initialize RAG if enabled for actual search functionality
		if (this.state.enableRAG && this.plugin.settings.ragConfig.enabled) {
			// RAG manager is already initialized above, so we can proceed with search functionality
		}

		// Initialize controllers
		void this.messageController.initialize();
		void this.agentController.initialize();
		void this.inputController.initialize();
		void this.chatController.initialize();

		// Configure controllers with UI elements
		this.messageController.setContainer(this.chatContainer);
		this.inputController.setInputElement(this.chatInput.textarea);
		this.inputController.setAttachmentPreviewElement(this.attachmentContainer);

		// Initialize conversation manager
		this.conversationManager = new ConversationManager(
			this.app,
			this.plugin,
			this.state,
			this.chatContainer,
			this.modelSelect,
			(message: Message) => this.addMessageToUI(message),
			(messages: Message[]) => this.renderMessageList(messages),
			() => this.updateTokenSummary()
		);
		void this.conversationManager.initializeContainer(this.conversationListContainer);

		// Configure chat controller with full pipeline options (after conversationManager is set up)
		this.chatController.configure({
			messagesContainer: this.chatContainer,
			chatContainer: this.chatContainer,
			messageController: this.messageController,
			agentController: this.agentController,
			chatService: this.chatService,
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
				// Reflect running state in the status bar item.
				this.plugin.setAgentRunning(isStreaming);
			},
		});
		this.conversationManager.on('conversation-loaded', (conv: Conversation) => {
			this.updateConversationTitle(conv.title);
			void this.applyConversationConfig(conv);
		});
		// Ensure handler returns void, not a Promise
		this.conversationManager.on('conversation-created', (conv: Conversation) => {
			this.updateConversationTitle(conv.title);
			void this.applyConversationConfig(conv);
		});
		this.conversationManager.on('conversation-updated', (conv: Conversation) => {
			if (conv.id === this.state.currentConversationId) {
				this.updateConversationTitle(conv.title);
			}
			// Do not return a Promise from event handler
		});

		// Load or create initial conversation
		await this.conversationManager.loadOrCreateConversation();
	}


	public async refreshModels(showNotice: boolean = false) {
		try {
			const previousSelection = this.modelSelect?.value ?? '';

			// Get all available models from configured providers (uses stored models by default)
			this.state.availableModels = await ModelManager.getAllAvailableModels(this.plugin.settings.llmConfigs);

			// Update model selector
			this.updateModelOptions();

			// Restore selection if possible, otherwise fall back to default
			if (this.modelSelect) {
				if (previousSelection && this.state.availableModels.some(m => m.id === previousSelection)) {
					this.modelSelect.value = previousSelection;
				} else if (this.plugin.settings.defaultModel && this.state.availableModels.some(m => m.id === this.plugin.settings.defaultModel)) {
					this.modelSelect.value = this.plugin.settings.defaultModel;
				}
			}

			await this.updateImageButtonVisibility();

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

	private updateModelOptions() {
		this.chatInput.updateModelOptions();
	}

	private async onModelChange() {
		// Model selection changed, update image button visibility based on vision capability
		await this.updateImageButtonVisibility();
	}

	private async updateImageButtonVisibility() {
		const selectedModel = this.modelSelect?.value || '';
		const supportsVision = selectedModel && await this.modelSupportsVision(selectedModel);
		const available = !!supportsVision;
		this.chatInput.setImageButtonVisible(available);
	}

	private async modelSupportsVision(modelId: string): Promise<boolean> {
		// Find the model to check if it has vision capability
		const allModels = await ModelManager.getAllAvailableModels(this.plugin.settings.llmConfigs);
		const model = allModels.find(m => m.id === modelId);

		return model?.capabilities?.includes('vision') || false;
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
			await this.handleModeChange('agent');
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


	/**
	 * Determines if web search should be automatically triggered based on the user's query
	 */
	private shouldAutoTriggerWebSearch(query: string): boolean {
		if (!this.plugin.settings.webSearchConfig.autoTrigger) {
			return false;
		}
		return this.webSearchService.shouldSearch(query);
	}

	private addMessageToUI(message: Message): HTMLElement {
		const callbacks: MessageRendererCallbacks = {
					saveMessageToNewNote: this.saveMessageToNewNote.bind(this) as (message: Message) => Promise<void>,
					insertMessageToNote: this.insertMessageToNote.bind(this) as (message: Message) => Promise<void>,
					regenerateMessage: this.regenerateMessage.bind(this) as (message: Message, element: HTMLElement) => Promise<void>,
					displayRagSources: (container: HTMLElement, message: Message) => this.displayRagSources(container, message.ragSources ?? []),
					getProviderAvatar: this.getProviderAvatar.bind(this) as (message: Message) => string,
					getProviderColor: this.getProviderColor.bind(this) as (message: Message) => string,
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

	/** Render markdown content into a target element (used after CLI streaming completes) */
	private renderMarkdownContent(target: HTMLElement, content: string): void {
		const cleaned = content.replace(/\n{3,}/g, '\n\n');
		const html = marked.parse(cleaned) as string;
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		target.empty();
		Array.from(doc.body.childNodes).forEach(node => {
			target.appendChild(node.cloneNode(true));
		});
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

	private styleActionButton(btn: HTMLButtonElement) {
		btn.addClass('ia-action-btn');
		btn.addClass('ia-clickable');
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
		this.vaultExportService.saveToNewNote(message);
	}

	private insertMessageToNote(message: Message) {
		this.vaultExportService.insertIntoNote(message);
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

	private createCheckbox(container: HTMLElement, label: string, checked: boolean, onChange: (checked: boolean) => void): HTMLInputElement {
		const checkboxContainer = container.createDiv('checkbox-container');
		const checkbox = checkboxContainer.createEl('input', { type: 'checkbox' });
		checkbox.checked = checked;
		checkbox.addEventListener('change', () => onChange(checkbox.checked));

		const labelEl = checkboxContainer.createEl('label');
		labelEl.setText(label);
		labelEl.addClass('ia-checkbox-label');
		labelEl.addClass('ia-clickable');
		labelEl.addEventListener('click', () => {
			checkbox.checked = !checkbox.checked;
			onChange(checkbox.checked);
		});

		return checkbox;
	}

	private createToggleButton(
		container: HTMLElement,
		options: { icon: string; label: string; active: boolean; disabled?: boolean; disabledMessage?: string; onChange: (active: boolean) => void; statusText?: string }
	): HTMLElement {
		const toggleBtn = container.createEl('button');
		toggleBtn.addClass('toggle-btn');
		if (options.active) {
			toggleBtn.addClass('active');
		}
		if (options.disabled) {
			toggleBtn.addClass('disabled');
			toggleBtn.disabled = true;
			if (options.disabledMessage) {
				toggleBtn.title = options.disabledMessage;
			}
		}

		const iconSpan = toggleBtn.createEl('span', { cls: 'toggle-icon' });
		iconSpan.setText(options.icon);

		const labelSpan = toggleBtn.createEl('span', { cls: 'toggle-label' });
		labelSpan.setText(options.label);

		// Add status text if provided
		if (options.statusText) {
			const statusSpan = toggleBtn.createEl('span', { cls: 'toggle-status ia-toggle-status' });
			statusSpan.setText(` (${options.statusText ?? ''})`);
		}

		toggleBtn.addEventListener('click', (e) => {
			e.preventDefault();
			if (options.disabled) {
				if (options.disabledMessage) {
					new Notice(options.disabledMessage);
				}
				return;
			}
			const newActive = !toggleBtn.hasClass('active');
			if (newActive) {
				toggleBtn.addClass('active');
			} else {
				toggleBtn.removeClass('active');
			}
			options.onChange(newActive);
		});

		return toggleBtn;
	}
	
	private async updateRagStatus(target?: HTMLElement | null) {
		await this.ragStatusPanel.updateStatus(target ?? this.ragActionItem);
	}

	private getProviderAvatar(message: Message): string {
		if (message.role === 'user') {
			return '🧑';
		}

		const provider = resolveMessageProviderId(message, this.plugin);
		const avatars: Record<string, string> = {
			'openai': '🤖',
			'anthropic': '🧠',
			'google': '🔍',
			'ollama': '🦙',
			'deepseek': '🌊',
			'openrouter': '🔀',
			'sap-ai-core': '💼',
			'groq': '⚡',
			'mistral': '🌬️',
			'togetherai': '🤝',
			'perplexity': '❓',
			'cohere': '🌐',
			'huggingface': '😊',
			'azure': '☁️',
			'bedrock': '🪨',
			'vertex': '🔺',
			'fireworks': '🎆',
			'lepton': '⚛️',
			'xai': '❌'
		};

		return provider ? (avatars[provider] || '🤖') : '🤖';
	}

	private getProviderColor(message: Message): string {
		const provider = resolveMessageProviderId(message, this.plugin);
		const colors: Record<string, string> = {
			'openai': '#10a37f',
			'anthropic': '#191919',
			'google': '#4285f4',
			'ollama': '#000000',
			'deepseek': '#0066cc',
			'openrouter': '#6366f1',
			'sap-ai-core': '#0070f2',
			'groq': '#f97316',
			'mistral': '#0d9488',
			'togetherai': '#ec4899'
		};
		return provider ? (colors[provider] || '#666666') : '#666666';
	}

	/**
	 * Estimate token count from text content
	 * Uses a simple approximation: ~1 token = 4 characters for English text
	 * This is a rough estimate; actual tokenizers may differ
	 */
	private estimateTokens(text: string): number {
		if (!text || typeof text !== 'string') return 0;
		
		// Simple estimation: 1 token ≈ 4 characters for English text
		// More accurate would be to use a tokenizer, but this is a good approximation
		return Math.ceil(text.length / 4);
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

	private async updateOptionsDisplay() {
		this.chatInput.updateModeSelector(this.state.mode);
		await this.updateQuickActionsState();
	}

	private getActiveAgent(): Agent | null {
		const activeId = this.plugin.settings.activeAgentId;
		if (!activeId) return null;
		return this.plugin.settings.agents.find(agent => agent.id === activeId) || null;
	}

	private showAgentCapabilities(): void {
		new AgentCapabilityModal(this.app, this.buildCurrentCapabilitySummary()).open();
	}

	private buildCurrentCapabilitySummary(references: Array<TFile | TFolder> = this.state.referencedFiles): AgentCapabilitySummary {
		const activeAgent = this.getActiveAgent();
		const tools = resolveAgentToolsForAgent(this.plugin.getToolRegistry(), activeAgent);
		return buildAgentCapabilitySummary({
			mode: this.state.mode,
			agent: activeAgent,
			tools,
			ragConfigured: this.plugin.settings.ragConfig.enabled,
			ragActive: this.getEffectiveRagEnabled(),
			webSearchConfigured: this.plugin.settings.webSearchConfig.enabled,
			webSearchActive: this.getEffectiveWebSearchEnabled(),
			references: references.map(ref => this.toCapabilityReference(ref)),
		});
	}

	private getEffectiveRagEnabled(): boolean {
		if (this.state.mode === 'agent') {
			return Boolean(this.getActiveAgent()?.ragEnabled && this.plugin.settings.ragConfig.enabled);
		}
		return this.state.enableRAG && this.plugin.settings.ragConfig.enabled;
	}

	private getEffectiveWebSearchEnabled(): boolean {
		if (this.state.mode === 'agent') {
			return Boolean(this.getActiveAgent()?.webSearchEnabled && this.plugin.settings.webSearchConfig.enabled);
		}
		return this.state.enableWebSearch && this.plugin.settings.webSearchConfig.enabled;
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






	private async handleModeChange(mode: 'chat' | 'agent') {
		this.state.mode = mode;
		if (mode === 'chat') {
			if (this.plugin.settings.activeAgentId) {
				this.plugin.settings.activeAgentId = null;
				await this.plugin.saveSettings();
			}
		} else {
			let ensuredAgentId = this.ensureDefaultAgentSelection();
			if (!ensuredAgentId) {
				await this.plugin.ensureDefaultAgent();
				ensuredAgentId = this.ensureDefaultAgentSelection();
			}
			if (ensuredAgentId) {
				const needsSave = this.plugin.settings.activeAgentId !== ensuredAgentId;
				this.plugin.settings.activeAgentId = ensuredAgentId;
				if (needsSave) {
					await this.plugin.saveSettings();
				}
				await this.applyAgentConfig(ensuredAgentId);
				this.refreshAgentSelect(ensuredAgentId);
			} else {
				new Notice(t('chat.notices.noAgents'));
				if (this.plugin.settings.activeAgentId) {
					this.plugin.settings.activeAgentId = null;
					await this.plugin.saveSettings();
				}
				this.refreshAgentSelect();
			}
		}

		this.chatInput.updateModeSelector(mode);
		if (mode === 'agent') {
			const activeAgent = this.getActiveAgent();
			this.chatHeader.updateAgentBadge(activeAgent ? (activeAgent.name ?? 'unknown') : null);
		} else {
			this.chatHeader.updateAgentBadge(null);
		}

		await this.updateOptionsDisplay();
	}

	private async handleAgentSelection(selectedId: string) {
		this.state.mode = 'agent';
		this.chatInput.updateModeSelector('agent');

		if (!selectedId) {
			this.plugin.settings.activeAgentId = null;
			await this.plugin.saveSettings();
			await this.updateOptionsDisplay();
			return;
		}

		if (this.plugin.settings.activeAgentId !== selectedId) {
			this.plugin.settings.activeAgentId = selectedId;
			await this.plugin.saveSettings();
			await this.applyAgentConfig(selectedId);
		}

		await this.updateOptionsDisplay();
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

	private updateConversationTitle(title: string) {
		this.chatHeader.updateConversationTitle(title);
	}

	private async applyConversationConfig(conv: Conversation) {
		this.chatInput.updateModeSelector(this.state.mode);

		const config = conv.config;
		if (!config) {
			await this.updateOptionsDisplay();
			return;
		}

		let settingsDirty = false;

		if (this.state.mode === 'agent') {
			let desiredAgentId = config.agentId ?? null;
			if (!desiredAgentId) {
				desiredAgentId = this.ensureDefaultAgentSelection();
			}
			if (desiredAgentId && !this.plugin.settings.agents.some(agent => agent.id === desiredAgentId)) {
				desiredAgentId = this.ensureDefaultAgentSelection();
			}

			if (desiredAgentId) {
				if (this.plugin.settings.activeAgentId !== desiredAgentId) {
					this.plugin.settings.activeAgentId = desiredAgentId;
					settingsDirty = true;
				}
				await this.applyAgentConfig(desiredAgentId, { silent: true });
			} else if (this.plugin.settings.activeAgentId) {
				this.plugin.settings.activeAgentId = null;
				settingsDirty = true;
			}

			this.refreshAgentSelect(desiredAgentId ?? undefined);
			if (this.chatInput.agentSelector) {
				this.chatInput.agentSelector.value = desiredAgentId || '';
			}
		} else {
			const availablePrompts = new Set(this.plugin.settings.systemPrompts.filter(p => p.enabled).map(p => p.id));
			const desiredPromptId = config.promptId ?? '';
			const promptToUse = desiredPromptId && availablePrompts.has(desiredPromptId) ? desiredPromptId : '';
			const currentPrompt = this.plugin.settings.activeSystemPromptId || '';
			if (promptToUse !== currentPrompt) {
				this.plugin.settings.activeSystemPromptId = promptToUse || null;
				settingsDirty = true;
			}
			if (this.chatInput.agentSelector) {
				this.chatInput.agentSelector.value = '';
			}
			if (this.plugin.settings.activeAgentId) {
				this.plugin.settings.activeAgentId = null;
				settingsDirty = true;
			}
		}

		if (settingsDirty) {
			await this.plugin.saveSettings();
		}

		this.applyStoredConfigControls(config);
		await this.updateOptionsDisplay();
	}

	private applyStoredConfigControls(config: ConversationConfig) {
		if (config.modelId) {
			this.setModelSelection(config.modelId);
		}
		if (typeof config.temperature === 'number') {
			this.state.temperature = config.temperature;
		}
		if (typeof config.maxTokens === 'number') {
			this.state.maxTokens = config.maxTokens;
		}
		if (typeof config.topP === 'number') {
			this.state.topP = config.topP;
		}
		if (typeof config.frequencyPenalty === 'number') {
			this.state.frequencyPenalty = config.frequencyPenalty;
		}
		if (typeof config.presencePenalty === 'number') {
			this.state.presencePenalty = config.presencePenalty;
		}
		if (this.state.mode !== 'agent' && typeof config.ragEnabled === 'boolean') {
			this.state.enableRAG = config.ragEnabled;
		}
		if (this.state.mode !== 'agent' && typeof config.webSearchEnabled === 'boolean') {
			this.state.enableWebSearch = config.webSearchEnabled;
		}
	}

	private setModelSelection(modelId: string) {
		if (!this.modelSelect || !modelId) return;
		const option = Array.from(this.modelSelect.options).find(opt => opt.value === modelId);
		if (option) {
			this.modelSelect.value = modelId;
		}
	}

	private async resetToDefaultChatConfiguration() {
		const defaultMode = this.plugin.settings.defaultChatMode ?? 'chat';
		let settingsDirty = false;

		if (defaultMode === 'agent') {
			this.state.mode = 'agent';
			this.chatInput.updateModeSelector('agent');
			let agentId = this.ensureDefaultAgentSelection();
			if (agentId && !this.plugin.settings.agents.some(agent => agent.id === agentId)) {
				agentId = null;
			}
			if (agentId) {
				if (this.plugin.settings.activeAgentId !== agentId) {
					this.plugin.settings.activeAgentId = agentId;
					settingsDirty = true;
				}
				await this.applyAgentConfig(agentId, { silent: true });
				this.refreshAgentSelect(agentId);
				if (this.chatInput.agentSelector) this.chatInput.agentSelector.value = agentId;
			} else {
				if (this.plugin.settings.activeAgentId) {
					this.plugin.settings.activeAgentId = null;
					settingsDirty = true;
				}
			}
			if (this.plugin.settings.activeSystemPromptId !== null) {
				this.plugin.settings.activeSystemPromptId = null;
				settingsDirty = true;
			}
		} else {
			this.state.mode = 'chat';
			this.chatInput.updateModeSelector('chat');
			this.chatHeader.updateAgentBadge(null);
			if (this.plugin.settings.activeAgentId) {
				this.plugin.settings.activeAgentId = null;
				settingsDirty = true;
			}
			this.refreshAgentSelect();
			if (this.chatInput.agentSelector) this.chatInput.agentSelector.value = '';
			if (this.plugin.settings.activeSystemPromptId !== null) {
				this.plugin.settings.activeSystemPromptId = null;
				settingsDirty = true;
			}

			const defaultModel = this.plugin.settings.defaultModel;
			if (defaultModel) {
				this.setModelSelection(defaultModel);
			} else if (this.modelSelect) {
				this.modelSelect.value = '';
			}

			const defaultTemperature = 0.7;
			const defaultMaxTokens = 4000;
			this.state.temperature = defaultTemperature;
			this.state.maxTokens = defaultMaxTokens;

			const defaultTopP = 1.0;
			this.state.topP = defaultTopP;

			const defaultPenalty = 0;
			this.state.frequencyPenalty = defaultPenalty;
			this.state.presencePenalty = defaultPenalty;

			this.state.enableRAG = false;
			this.state.enableWebSearch = false;
		}

		if (settingsDirty) {
			await this.plugin.saveSettings();
		}
		await this.updateOptionsDisplay();
	}

	private async updateQuickActionsState() {
		if (this.ragActionItem) {
			const enabled = this.plugin.settings.ragConfig.enabled;
			this.chatInput.updateActionToggleState(
				this.ragActionItem,
				enabled,
				this.state.enableRAG,
				enabled ? (this.state.enableRAG ? t('chat.agentSummary.on') : t('chat.agentSummary.off')) : t('chat.status.disabled')
			);
		}

		if (this.webActionItem) {
			const enabled = this.plugin.settings.webSearchConfig.enabled;
			this.chatInput.updateActionToggleState(
				this.webActionItem,
				enabled,
				this.state.enableWebSearch,
				enabled ? (this.state.enableWebSearch ? t('chat.agentSummary.on') : t('chat.agentSummary.off')) : t('chat.status.disabled')
			);
		}

		await this.updateImageButtonVisibility();
	}

	private async handleQuickActionRag() {
		if (this.state.mode === 'agent') {
			return;
		}
		if (!this.plugin.settings.ragConfig.enabled) {
			new Notice(t('chat.notices.ragDisabled'));
			return;
		}
		this.state.enableRAG = !this.state.enableRAG;
		await this.updateQuickActionsState();
		await this.updateRagStatus();
	}

	private async handleQuickActionWeb() {
		if (this.state.mode === 'agent') {
			return;
		}
		if (!this.plugin.settings.webSearchConfig.enabled) {
			new Notice(t('chat.notices.webSearchDisabled'));
			return;
		}
		this.state.enableWebSearch = !this.state.enableWebSearch;
		await this.updateQuickActionsState();
	}

	private ensureDefaultAgentSelection(): string | null {
		const agents = this.plugin.settings.agents;
		if (!agents || agents.length === 0) {
			return null;
		}

		const current = this.plugin.settings.activeAgentId;
		if (current && agents.some(agent => agent.id === current)) {
			return current;
		}

		const fallback = agents.find(agent => agent.id === DEFAULT_AGENT_ID) || agents[0];
		return fallback?.id ?? null;
	}

	private refreshAgentSelect(preferredAgentId?: string): string | null {
		return this.chatInput.refreshAgentSelect(preferredAgentId);
	}


	private async applyAgentConfig(agentId: string, options?: { silent?: boolean }) {
		const agent = this.plugin.settings.agents.find(a => a.id === agentId);
		if (!agent) return;

		// Apply agent's LLM configuration
		this.state.temperature = agent.temperature;
		this.state.maxTokens = agent.maxTokens;

		// Select agent's model based on strategy
		let effectiveModelId: string;
		switch (agent.modelStrategy.strategy) {
			case 'fixed':
				effectiveModelId = agent.modelStrategy.modelId || this.plugin.settings.defaultModel || '';
				break;
			case 'chat-view':
				// Use the currently selected model in the view (keep current selection if it exists)
				effectiveModelId = this.modelSelect.value || this.plugin.settings.defaultModel || '';
				break;
			case 'default':
				effectiveModelId = this.plugin.settings.defaultModel || '';
				break;
			default:
				effectiveModelId = agent.modelStrategy.modelId || this.plugin.settings.defaultModel || '';
		}

		const modelOption = Array.from(this.modelSelect.options).find(
			opt => opt.value === effectiveModelId
		);
		if (modelOption) {
			this.modelSelect.value = effectiveModelId;
		} else if (effectiveModelId) {
			// If the effective model isn't in the dropdown options, set it anyway so it's available
			// The dropdown will show empty but the value will be set
			this.modelSelect.value = effectiveModelId;
		}

		// Apply agent's system prompt
		if (agent.systemPromptId) {
			this.plugin.settings.activeSystemPromptId = agent.systemPromptId;
		}

		// Apply agent's feature flags
		this.state.enableRAG = agent.ragEnabled;
		this.state.enableWebSearch = agent.webSearchEnabled;

		// Update RAG manager with agent configuration
		try {
			this.ragManager.updateConfig(this.plugin.settings.ragConfig);
			await this.ragManager.initialize();
			
			// Update RAG status
				await this.updateRagStatus();
		} catch (_error) {
			const errMsg = _error instanceof Error ? _error.message : String(_error);
			console.error('Error updating RAG with agent config:', errMsg);
		}

		this.refreshAgentSelect(agentId);
		this.chatHeader.updateAgentBadge(agent.name ?? 'unknown');

		if (!options?.silent) {
			new Notice(t('chat.notices.agentConfigApplied', { name: `${agent.icon || '🤖'} ${agent.name ?? 'unknown'}` }));
		}
	}

	private agentExecutionTraceEl: HTMLElement | null = null;

	private updateExecutionTrace(container: HTMLElement) {
		updateExecutionTrace(container, this.state.agentExecutionSteps);
	}

	private createAgentExecutionTraceContainer(messageBody: HTMLElement): HTMLElement {
		return createAgentExecutionTraceContainer(messageBody, this.state.agentExecutionSteps.length);
	}

	private displayAgentFinalAnswer(contentEl?: HTMLElement) {
		if (!contentEl) {
			return;
		}
		if (this.state.agentExecutionSteps.length === 0) {
			return;
		}

		const lastMessage = this.state.messages[this.state.messages.length - 1];
		if (!lastMessage || lastMessage.role !== 'assistant') {
			return;
		}

		const hasToolCall = lastMessage.content.includes('```json') &&
			lastMessage.content.match(/```json\s*\n([\s\S]*?)\n```/);

		if (!hasToolCall) {
			let finalAnswer = lastMessage.content;
			finalAnswer = finalAnswer.replace(/```json[\s\S]*?```/g, '').trim();
			finalAnswer = finalAnswer.replace(/^Thought:\s*/i, '').trim();
			finalAnswer = finalAnswer.replace(/^Observation:\s*/i, '').trim();
			const actionIndex = finalAnswer.toLowerCase().indexOf('action:');
			if (actionIndex !== -1) {
				finalAnswer = finalAnswer.substring(0, actionIndex).trim();
			}

			if (finalAnswer) {
				contentEl.empty();
				const finalAnswerEl = contentEl.createDiv('agent-final-answer');
				try {
					const html = marked.parse(finalAnswer) as string;
					// Use DOMParser to safely parse HTML
					const parser = new DOMParser();
					const doc = parser.parseFromString(html, 'text/html');
					Array.from(doc.body.childNodes).forEach(node => {
						finalAnswerEl.appendChild(node.cloneNode(true));
					});
				} catch (error) {
					console.debug('Failed to render agent final answer as markdown, falling back to text.', error);
					finalAnswerEl.createDiv().setText(finalAnswer);
				}

							(lastMessage as { agentExecutionSteps?: unknown[] }).agentExecutionSteps = [...this.state.agentExecutionSteps];
			}
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

	/**
	 * Continue the agent conversation after tool execution
	 */
	// continueAgentConversation removed — agent loop is now in ChatService.executeAgentLoop()

	private async clearchat() {
		if (!await showConfirm(this.app, 'Clear all messages in this conversation?')) return;

		this.state.messages = [];
		this.chatContainer.empty();
		await this.conversationManager.saveCurrentConversation();
	}

	private attachFile() {
		// Get all markdown files in vault
		const files = this.app.vault.getMarkdownFiles();

		if (files.length === 0) {
			new Notice(t('chat.notices.noFilesInVault'));
			return;
		}

		// Create a simple file picker menu
		const menu = new Menu();
		files.slice(0, 20).forEach(file => {
			menu.addItem((item) => {
				item.setTitle(file.path)
					.setIcon('document')
					.onClick(() => {
						void (async () => {
							const content = await this.app.vault.read(file);
							this.state.currentAttachments.push({
								type: 'file',
								name: file.name,
								path: file.path,
								content: content
							});
							this.updateAttachmentPreview();
							new Notice(t('chat.notices.attached', { name: file.name ?? 'unknown' }));
						})();
					});
			});
		});

		menu.showAtPosition({ x: 0, y: 0 });
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

	initializeMCPServers() {
		const registry = this.plugin.getToolRegistry();
		const mcpCount = registry.getTools().filter(t => t.origin.kind === 'mcp').length;
		if (mcpCount === 0) {
			console.debug('[MCP] No MCP tools available');
		}
	}

	async onClose() {
		// Cleanup controllers
		void this.messageController?.cleanup();
		void this.agentController?.cleanup();
		void this.inputController?.cleanup();
		void this.chatController?.cleanup();
		// Explicitly ignore returned Promise from save to avoid floating promises on shutdown

		// Cleanup RAG
		if (this.ragManager) {
			await this.ragManager.destroy();
		}
		// Persist any pending settings safely without awaiting here
		void this.plugin.saveSettings();

		// Shared tool manager stays active for background MCP access
	}
}
	
