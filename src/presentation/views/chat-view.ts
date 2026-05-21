import { App, ItemView, WorkspaceLeaf, Notice, Menu, TFile, TFolder, setIcon } from 'obsidian';
import { t } from '@/i18n';
import { showConfirm } from '@/presentation/components/modals/confirm-modal';
import { TextInputModal } from '@/presentation/components/modals/text-input-modal';
import { SearchableReferenceModal } from '@/presentation/components/modals/searchable-reference-modal';
import { SearchableImageModal } from '@/presentation/components/modals/searchable-image-modal';
import { SingleFileSelectionModal } from '@/presentation/components/modals/single-file-selection-modal';
import type IntelligenceAssistantPlugin from '@plugin';
import { DEFAULT_AGENT_ID } from '@/constants';
import type {Message, Conversation, ConversationConfig, Agent} from '@/types';
import { ModelManager } from '@/infrastructure/llm/model-manager';
import { marked } from 'marked';
import { 
	ToolManager, 
	WebSearchService, 
	ChatService 
} from '@/application/services';
import { RAGManager } from '@/infrastructure/rag-manager';
import { VaultExportService } from '@/application/services/vault-export-service';
import { ChatViewState } from '@/presentation/state/chat-view-state';
import { ConversationManager } from '@/presentation/components/chat/managers/conversation-manager';
import { renderMessage, MessageRendererCallbacks } from '@/presentation/components/chat/message-renderer';
import { updateExecutionTrace, createAgentExecutionTraceContainer, collapseExecutionTrace, hasAgentToolCall, extractFinalContent, reconstructAgentSteps } from '@/presentation/components/chat/handlers/tool-call-handler';
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
import { } from '@/presentation/components/utils/dom-helpers';

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

	// Services
	private toolManager: ToolManager;
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

		this.toolManager = this.plugin.getToolManager();

		this.ragManager = this.plugin.getRAGManager();

		this.webSearchService = new WebSearchService(this.plugin.settings.webSearchConfig, new ObsidianHttpClient());
		this.chatService = new ChatService(
			new ObsidianFileSystem(this.app),
			this.toolManager,
			this.ragManager,
			this.webSearchService,
			this.plugin.settings.llmConfigs,
			this.plugin.tokenUsageRepo ?? undefined,
			this.plugin.settings.defaultModel
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
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass('intelligence-assistant-chat-container');

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
		this.conversationListContainer.addClass('is-collapsed');

		// Initialize Chat Header Component
		this.chatHeader = new ChatHeaderComponent(
			this.mainChatContainer,
			this.app,
			this.plugin,
			this.state,
			{
				onToggleConversations: () => this.toggleConversationListVisibility(),
				onNewChat: async () => {
					await this.resetToDefaultChatConfiguration();
					await this.conversationManager.createNewConversation();
				},
				onModelChange: () => this.onModelChange(),
				onSettingsOpen: () => {
					const settingApi = (this.app as any).setting;
					if (settingApi) {
						settingApi.open();
						settingApi.openTabById('intelligence-assistant');
					}
				},
				onTemperatureChange: (val) => { this.state.temperature = val; },
				onMaxTokensChange: (val) => { this.state.maxTokens = val; },
				onTopPChange: (val) => { this.state.topP = val; },
				onFrequencyPenaltyChange: (val) => { this.state.frequencyPenalty = val; },
				onPresencePenaltyChange: (val) => { this.state.presencePenalty = val; },
				onModeChange: (mode) => this.handleModeChange(mode),
				onPromptChange: async (promptId) => {
					this.plugin.settings.activeSystemPromptId = promptId;
					await this.plugin.saveSettings();
				},
				onAgentChange: (agentId) => this.handleAgentSelection(agentId)
			}
		);

		// Chat messages container
		this.chatContainer = this.mainChatContainer.createDiv('chat-messages');

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
				onAttachImage: async () => await this.attachImage(),
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
		await this.initializeMCPServers();

		await this.updateOptionsDisplay();

		// Add click-outside handler to hide conversation list
		this.registerDomEvent(document, 'click', (e: MouseEvent) => {
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
				if (this.chatInput) {
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
			this.updateModelControlDisplay();

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
		const available = this.state.mode === 'chat' && !!supportsVision;
		this.chatInput.setImageButtonVisible(available);
	}

	private async modelSupportsVision(modelId: string): Promise<boolean> {
		// Find the model to check if it has vision capability
		const allModels = await ModelManager.getAllAvailableModels(this.plugin.settings.llmConfigs);
		const model = allModels.find(m => m.id === modelId);

		return model?.capabilities?.includes('vision') || false;
	}

	private async sendMessage(text: string) {
		await this.chatController.sendMessage(text);
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
					getProviderColor: this.getProviderColor.bind(this) as (message: Message) => string
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
		const summary = this.conversationManager.getTokenSummary();
		this.chatHeader.updateTokenSummary(`Tokens: ${summary.total} (${summary.prompt} input + ${summary.completion} output)`);
	}

	private async updateOptionsDisplay() {
		this.chatInput.updateModeSelector(this.state.mode);
		this.updatePromptSelectorVisibility();
		await this.updateQuickActionsState();
		this.updateModelControlDisplay();
	}

	private updatePromptSelectorVisibility() {
		if (!this.chatHeader.promptSelector) return;
		if (this.state.mode === 'agent') {
			this.chatHeader.promptSelector.addClass('ia-hidden');
			this.chatHeader.promptSelector.disabled = true;
			if (this.chatHeader.promptSelectorGroup) this.chatHeader.promptSelectorGroup.addClass('ia-hidden');
		} else {
			this.chatHeader.promptSelector.removeClass('ia-hidden');
			this.chatHeader.promptSelector.disabled = false;
			if (this.chatHeader.promptSelectorGroup) this.chatHeader.promptSelectorGroup.removeClass('ia-hidden');
		}
	}

	private updateAgentSelectorVisibility() {
		if (!this.chatHeader.agentSelector) return;
		if (this.state.mode === 'agent') {
			const wasDisabled = this.chatHeader.agentSelector.disabled;
			this.chatHeader.agentSelector.removeClass('ia-hidden');
			this.chatHeader.agentSelector.disabled = false;
			if (this.chatHeader.agentSelectorGroup) {
				this.chatHeader.agentSelectorGroup.removeClass('ia-hidden');
			}
			if (wasDisabled) {
				this.refreshAgentSelect();
			}
		} else {
			this.chatHeader.agentSelector.addClass('ia-hidden');
			this.chatHeader.agentSelector.disabled = true;
			if (this.chatHeader.agentSelectorGroup) this.chatHeader.agentSelectorGroup.addClass('ia-hidden');
		}
	}

	private getActiveAgent(): Agent | null {
		const activeId = this.plugin.settings.activeAgentId;
		if (!activeId) return null;
		return this.plugin.settings.agents.find(agent => agent.id === activeId) || null;
	}

	private updateModelControlDisplay() {
		const isAgentMode = this.state.mode === 'agent';
		const activeAgent = this.getActiveAgent();
		const usesChatViewModel = activeAgent?.modelStrategy?.strategy === 'chat-view';
		const showControls = !isAgentMode || !activeAgent || usesChatViewModel;

		if (this.chatHeader.modelControlsContainer) {
			this.chatHeader.modelControlsContainer.toggleClass('ia-hidden', !showControls);
		}
		if (this.modelSelect) {
			this.modelSelect.disabled = !showControls;
		}
		if (this.chatHeader.temperatureSlider) {
			this.chatHeader.temperatureSlider.disabled = !showControls;
		}
		if (this.chatHeader.maxTokensInput) {
			this.chatHeader.maxTokensInput.disabled = !showControls;
		}

		const shouldShowSummary = isAgentMode && !!activeAgent && !usesChatViewModel;
			if (this.chatHeader.agentConfigSummaryEl) {
				this.chatHeader.agentConfigSummaryEl.toggleClass('ia-hidden', !shouldShowSummary);
			}
		if (shouldShowSummary && activeAgent) {
			this.renderAgentSummary(activeAgent);
		}
	}

	private renderAgentSummary(agent: Agent) {
		if (!this.chatHeader.agentSummaryDetailsEl) return;
		if (this.chatHeader.agentSummaryTitleEl) {
			this.chatHeader.agentSummaryTitleEl.setText(t('chat.agentSummary.configuration', { name: `${agent.icon || '🤖'} ${agent.name ?? 'unknown'}` }));
		}

		this.chatHeader.agentSummaryDetailsEl.empty();
		const chips = [
			{ label: t('chat.agentSummary.model'), value: this.getAgentModelSummary(agent) },
			{ label: t('chat.agentSummary.temp'), value: this.formatTemperature(agent.temperature) },
			{ label: t('chat.agentSummary.max'), value: this.formatTokenLimit(agent.maxTokens) },
			{ label: t('chat.agentSummary.rag'), value: this.formatToggleStatus(agent.ragEnabled) },
			{ label: t('chat.agentSummary.web'), value: this.formatToggleStatus(agent.webSearchEnabled) },
			{ label: t('chat.agentSummary.tools'), value: this.getAgentToolsLabel(agent) },
			{ label: t('chat.agentSummary.memory'), value: this.getAgentMemoryLabel(agent) }
		];

		chips
			.filter(chip => chip.value && chip.value.trim().length > 0)
			.forEach(({ label, value }) => this.createAgentSummaryChip(label, value));
	}

	private createAgentSummaryChip(label: string, value: string) {
		if (!this.chatHeader.agentSummaryDetailsEl) return;
		const chip = this.chatHeader.agentSummaryDetailsEl.createSpan({ cls: 'chat-agent-chip' });
		chip.createSpan({ cls: 'chat-agent-chip-label', text: label });
		chip.createSpan({ cls: 'chat-agent-chip-value', text: value });
	}

	private getAgentModelSummary(agent: Agent): string {
		const strategy = agent.modelStrategy?.strategy ?? 'fixed';
		if (strategy === 'fixed') {
			const fixedId = agent.modelStrategy.modelId || '';
			const name = fixedId ? this.getModelDisplayName(fixedId) : t('chat.agentSummary.customModel');
			return t('chat.agentSummary.modelFixed', { name: name ?? 'unknown' });
		}
		if (strategy === 'default') {
			const defaultId = this.plugin.settings.defaultModel || '';
			const name = defaultId ? this.getModelDisplayName(defaultId) : t('chat.agentSummary.notSet');
			return t('chat.agentSummary.modelDefault', { name: name ?? 'unknown' });
		}
		const currentId = this.modelSelect?.value || this.plugin.settings.defaultModel || '';
		const name = currentId ? this.getModelDisplayName(currentId) : t('chat.agentSummary.customModel');
		return t('chat.agentSummary.modelChatView', { name: name ?? 'unknown' });
	}

	private getModelDisplayName(modelId: string | null | undefined): string {
		if (!modelId) return t('chat.agentSummary.notSet');
		const match = this.state.availableModels.find(model => model.id === modelId);
		return match?.name || modelId;
	}

	private formatTokenLimit(value: number): string {
		return value > 0 ? value.toLocaleString() : t('chat.agentSummary.auto');
	}

	private formatToggleStatus(enabled: boolean): string {
		return enabled ? t('chat.agentSummary.on') : t('chat.agentSummary.off');
	}

	private getAgentToolsLabel(agent: Agent): string {
		const builtIn = agent.enabledBuiltInTools.length;
		const mcp = agent.enabledMcpServers.length;
		const cliTools = this.plugin.settings.cliTools?.filter(tool => tool.enabled) ?? [];
		const cli = agent.enabledAllCLITools ? cliTools.length : (agent.enabledCLITools?.filter(id => cliTools.some(tool => tool.id === id)).length ?? 0);
		const segments = [] as string[];
		if (builtIn > 0) segments.push(t('chat.agentSummary.builtIn', { count: builtIn }));
		if (mcp > 0) segments.push(t('chat.agentSummary.mcp', { count: mcp }));
		if (cli > 0) segments.push(t('chat.agentSummary.cli', { count: cli }));
		if (segments.length === 0) {
			return t('chat.agentSummary.none');
		}
		return segments.join(' + ');
	}

	private getAgentMemoryLabel(agent: Agent): string {
		switch (agent.memoryType) {
			case 'short-term':
				return t('chat.agentSummary.shortTerm');
			case 'long-term':
				return t('chat.agentSummary.longTerm');
			default:
				return t('chat.agentSummary.disabledMemory');
		}
	}

	private formatTemperature(value: number): string {
		return Number.isInteger(value)
			? value.toString()
			: value.toFixed(1).replace(/0+$/, '').replace(/\.$/, '');
	}

	private updateTemperatureDisplay(value: number) {
		if (this.chatHeader.temperatureSlider) {
			this.chatHeader.temperatureSlider.value = value.toString();
		}
		if (this.chatHeader.temperatureValueEl) {
			this.chatHeader.temperatureValueEl.setText(this.formatTemperature(value));
		}
	}

	private populatePromptSelectorOptions() {
		if (!this.chatHeader.promptSelector) return;
		const enabledPrompts = this.plugin.settings.systemPrompts.filter(p => p.enabled);
		this.chatHeader.promptSelector.empty();
		this.chatHeader.promptSelector.createEl('option', { value: '', text: t('chat.noSystemPrompt') });
		enabledPrompts.forEach(p => {
			const option = this.chatHeader.promptSelector!.createEl('option', { value: p.id, text: p.name });
			if (this.plugin.settings.activeSystemPromptId === p.id) {
				option.selected = true;
			}
		});
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
		if (this.chatHeader.conversationTitleEl) {
			this.chatHeader.conversationTitleEl.setText(title || 'Current Conversation');
		}
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

			if (desiredAgentId && this.plugin.settings.activeAgentId !== desiredAgentId) {
				this.plugin.settings.activeAgentId = desiredAgentId;
				settingsDirty = true;
				await this.applyAgentConfig(desiredAgentId, { silent: true });
			} else if (!desiredAgentId && this.plugin.settings.activeAgentId) {
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
			if (this.chatHeader.promptSelector) {
				this.chatHeader.promptSelector.value = promptToUse;
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
			this.updateTemperatureDisplay(config.temperature);
		}
		if (typeof config.maxTokens === 'number') {
			this.state.maxTokens = config.maxTokens;
			if (this.chatHeader.maxTokensInput) {
				this.chatHeader.maxTokensInput.value = config.maxTokens.toString();
			}
		}
		if (typeof config.topP === 'number') {
			this.state.topP = config.topP;
			if (this.chatHeader.topPSlider) this.chatHeader.topPSlider.value = config.topP.toString();
			if (this.chatHeader.topPValueEl) this.chatHeader.topPValueEl.setText(config.topP.toFixed(2));
		}
		if (typeof config.frequencyPenalty === 'number') {
			this.state.frequencyPenalty = config.frequencyPenalty;
			if (this.chatHeader.frequencyPenaltySlider) this.chatHeader.frequencyPenaltySlider.value = config.frequencyPenalty.toString();
			if (this.chatHeader.frequencyPenaltyValueEl) this.chatHeader.frequencyPenaltyValueEl.setText(config.frequencyPenalty.toFixed(1));
		}
		if (typeof config.presencePenalty === 'number') {
			this.state.presencePenalty = config.presencePenalty;
			if (this.chatHeader.presencePenaltySlider) this.chatHeader.presencePenaltySlider.value = config.presencePenalty.toString();
			if (this.chatHeader.presencePenaltyValueEl) this.chatHeader.presencePenaltyValueEl.setText(config.presencePenalty.toFixed(1));
		}
		if (typeof config.ragEnabled === 'boolean') {
			this.state.enableRAG = config.ragEnabled;
		}
		if (typeof config.webSearchEnabled === 'boolean') {
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
			if (this.chatHeader.promptSelector) {
				this.chatHeader.promptSelector.value = '';
			}
			if (this.plugin.settings.activeSystemPromptId !== null) {
				this.plugin.settings.activeSystemPromptId = null;
				settingsDirty = true;
			}
		} else {
			this.state.mode = 'chat';
			this.chatInput.updateModeSelector('chat');
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
			if (this.chatHeader.promptSelector) {
				this.chatHeader.promptSelector.value = '';
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
			this.updateTemperatureDisplay(defaultTemperature);
			this.state.maxTokens = defaultMaxTokens;
			if (this.chatHeader.maxTokensInput) {
				this.chatHeader.maxTokensInput.value = defaultMaxTokens.toString();
			}

			const defaultTopP = 1.0;
			this.state.topP = defaultTopP;
			if (this.chatHeader.topPSlider) this.chatHeader.topPSlider.value = defaultTopP.toString();
			if (this.chatHeader.topPValueEl) this.chatHeader.topPValueEl.setText(defaultTopP.toFixed(2));

			const defaultPenalty = 0;
			this.state.frequencyPenalty = defaultPenalty;
			if (this.chatHeader.frequencyPenaltySlider) this.chatHeader.frequencyPenaltySlider.value = defaultPenalty.toString();
			if (this.chatHeader.frequencyPenaltyValueEl) this.chatHeader.frequencyPenaltyValueEl.setText(defaultPenalty.toFixed(1));

			this.state.presencePenalty = defaultPenalty;
			if (this.chatHeader.presencePenaltySlider) this.chatHeader.presencePenaltySlider.value = defaultPenalty.toString();
			if (this.chatHeader.presencePenaltyValueEl) this.chatHeader.presencePenaltyValueEl.setText(defaultPenalty.toFixed(1));

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
		if (!this.plugin.settings.ragConfig.enabled) {
			new Notice(t('chat.notices.ragDisabled'));
			return;
		}
		this.state.enableRAG = !this.state.enableRAG;
		await this.updateQuickActionsState();
		await this.updateRagStatus();
	}

	private async handleQuickActionWeb() {
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

		// Update UI elements if they exist
		if (this.chatHeader.temperatureSlider) {
			this.chatHeader.temperatureSlider.value = String(agent.temperature);
		}
		if (this.chatHeader.maxTokensInput) {
			this.chatHeader.maxTokensInput.value = String(agent.maxTokens);
		}

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

		// Update tool manager with agent's enabled tools
		const toolConfigs = agent.enabledBuiltInTools.map((toolType: string) => ({
			type: toolType,
			enabled: true
		}));
		this.toolManager.setToolConfigs(toolConfigs);

		// Ensure MCP servers for this agent are connected and tools are available
		for (const serverName of agent.enabledMcpServers) {
			const server = this.plugin.settings.mcpServers.find(s => s.name === serverName && s.enabled);
			if (server) {
				// Connect the server if not already connected
				const isConnected = this.toolManager.getMCPServers().includes(serverName);
				if (!isConnected) {
					this.toolManager.registerMCPServer(server).catch((_error: unknown) => {
						const errMsg = _error instanceof Error ? _error.message : String(_error);
						console.error(`Failed to connect to MCP server ${serverName ?? 'unknown'} for agent:`, errMsg);
					});
				}
			}
		}

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

	async initializeMCPServers() {
		const { initializeMCPServers } = await import('@/application/services/mcp-service');
		void initializeMCPServers(
			this.plugin.settings.mcpServers,
			this.toolManager,
			async () => { await this.plugin.saveSettings(); }
		);
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
	

