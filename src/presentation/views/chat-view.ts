import { App, ItemView, WorkspaceLeaf, Notice, Menu, TFile, TFolder, Modal, Setting, setIcon, FileSystemAdapter } from 'obsidian';
import { showConfirm } from '@/presentation/components/modals/confirm-modal';
import type IntelligenceAssistantPlugin from '@plugin';
import { DEFAULT_AGENT_ID } from '@/constants';
import type {Message, FileReference, Conversation, ConversationConfig, ModelInfo, Agent, LLMConfig, AgentExecutionStep} from '@/types';
import { ProviderFactory } from '@/infrastructure/llm/provider-factory';
import { ModelManager } from '@/infrastructure/llm/model-manager';
import { CLIAgentService } from '@/infrastructure/cli-agent/cli-agent-service';
import type { CLIAgentConfig, CLIAgentMessage } from '@/types';
import { marked } from 'marked';
import { ToolManager } from '@/application/services/tool-manager';
import { RAGManager } from '@/infrastructure/rag-manager';
import { WebSearchService } from '@/application/services/web-search-service';
import { ChatViewState } from '@/presentation/state/chat-view-state';
import { ConversationManager } from '@/presentation/components/chat/managers/conversation-manager';
import { renderMessage, MessageRendererCallbacks } from '@/presentation/components/chat/message-renderer';
import { handleStreamingChat } from '@/presentation/components/chat/handlers/streaming-handler';
import { processToolCalls, updateExecutionTrace, createAgentExecutionTraceContainer, collapseExecutionTrace } from '@/presentation/components/chat/handlers/tool-call-handler';
import {
	MessageController,
	AgentController,
	InputController,
	ChatController
} from '@/presentation/components/chat/controllers';
import { resolveMessageProviderId } from '@/presentation/components/chat/utils';
import { } from '@/presentation/components/utils/dom-helpers';

export const CHAT_VIEW_TYPE = 'intelligence-assistant-chat';

interface AssistantResponseOptions {
	text: string;
	selectedModel: string;
	config: LLMConfig;
	llmContent: string;
	targetMessage: Message;
}

type RagIndexStats = {
	chunkCount: number;
	fileCount: number;
	totalSize: number;
	indexedFiles: string[];
};

export class ChatView extends ItemView {
	// Centralized state management
	private state: ChatViewState;

	// Managers
	private conversationManager: ConversationManager;

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
	private temperatureSlider: HTMLInputElement;
	private maxTokensInput: HTMLInputElement;
	private topPSlider: HTMLInputElement | null = null;
	private frequencyPenaltySlider: HTMLInputElement | null = null;
	private presencePenaltySlider: HTMLInputElement | null = null;
	private modelControlsContainer: HTMLElement | null = null;
	private agentConfigSummaryEl: HTMLElement | null = null;
	private agentSummaryDetailsEl: HTMLElement | null = null;
	private agentSummaryTitleEl: HTMLElement | null = null;
	private conversationListContainer: HTMLElement;
	private mainChatContainer: HTMLElement;
	private modelCountEl: HTMLElement | null = null;
	private tokenSummaryEl: HTMLElement | null = null;
	private attachmentContainer: HTMLElement | null = null;
	private referenceContainer: HTMLElement | null = null;
	private ragActionItem: HTMLElement | null = null;
	private webActionItem: HTMLElement | null = null;
	private imageActionItem: HTMLElement | null = null;
	private headerActionsContainer: HTMLElement | null = null;

	// Services
	private toolManager: ToolManager;
	private ragManager: RAGManager;
	private webSearchService: WebSearchService;
	private cliAgentService: CLIAgentService;
	private selectedCliAgentId: string | null = null;

	// UI elements
	private modeSelector: HTMLSelectElement | null = null;
	private promptSelectorGroup: HTMLElement | null = null;
	private agentSelectorGroup: HTMLElement | null = null;
	private agentSelector: HTMLSelectElement | null = null;
	private conversationTitleEl: HTMLElement | null = null;
	private promptSelector: HTMLSelectElement | null = null;
	private streamingMessageEl: HTMLElement | null = null;
	private stopBtn: HTMLElement | null = null;
	private sendHint: HTMLElement | null = null;
	private temperatureValueEl: HTMLElement | null = null;
	private topPValueEl: HTMLElement | null = null;
	private frequencyPenaltyValueEl: HTMLElement | null = null;
	private presencePenaltyValueEl: HTMLElement | null = null;

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
		this.cliAgentService = new CLIAgentService();

		// Create RAG manager with functions to get current chat model and default model
		this.ragManager = new RAGManager(
			this.app,
			this.plugin.settings.ragConfig,
			this.plugin.settings.llmConfigs,
			// Function to get current chat view's selected model
			() => {
				if (this.modelSelect instanceof HTMLSelectElement) {
					const modelValue = this.modelSelect.value;
					if (modelValue && modelValue.trim() !== '') {
						return modelValue;
					}
				}
				return null;
			},
			// Function to get global default model from settings
			() => this.plugin.settings.defaultModel
		);

		this.webSearchService = new WebSearchService(this.plugin.settings.webSearchConfig);
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

		// Toolbar Row A: breadcrumb + actions
		this.createActionRow(this.mainChatContainer);

		// Toolbar Row B: mode + model + agent/prompt + token summary
		const toolbarB = this.mainChatContainer.createDiv('chat-toolbar-b');
		this.createTopControls(toolbarB);
		this.createModelRow(toolbarB);
		this.createTokenRow(toolbarB);

		await this.refreshModels();

		// Set default model if configured
		if (this.plugin.settings.defaultModel && this.modelSelect.value === '') {
			this.modelSelect.value = this.plugin.settings.defaultModel;
		}
		
		// Update image button visibility based on the selected model's vision capability
		await this.updateImageButtonVisibility();

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

		// Input container
		this.inputContainer = this.mainChatContainer.createDiv('chat-input-container');

		const inputHeader = this.inputContainer.createDiv('chat-input-header');

		// Reference area with @ mentions
		this.referenceContainer = inputHeader.createDiv('input-reference-area');
		this.referenceContainer.addClass('ia-hidden');

		this.referenceContainer.createDiv('reference-list');

		// Header quick actions (references, RAG, Web, image)
		this.setupHeaderActions(inputHeader);

		// Text input area
		const editorWrapper = this.inputContainer.createDiv('chat-input-editor');
		const textarea = editorWrapper.createEl('textarea', {
			attr: {
				placeholder: 'Type your message... (Enter to send, Shift+Enter for new line)',
				rows: '1'
			}
		});
		textarea.addClass('chat-input');

		// Send button
		const sendBtn = editorWrapper.createEl('button', { cls: 'ia-send-btn' });
		sendBtn.setAttribute('aria-label', 'Send message');
		setIcon(sendBtn, 'arrow-up');

		// Auto-resize textarea
		textarea.addEventListener('input', () => {
			textarea.setCssProps({ 'height': 'auto' });
			textarea.setCssProps({ 'height': Math.min(textarea.scrollHeight, 200) + 'px' });
			sendBtn.toggleClass('is-active', textarea.value.trim().length > 0);
		});

		// Input footer (attachments + actions)
		const controlsSection = this.inputContainer.createDiv('chat-input-footer');
		const bottomControls = controlsSection.createDiv('input-bottom-controls');
		bottomControls.createDiv('bottom-left-controls');

		// Attachment preview area
		const middleControls = bottomControls.createDiv('bottom-middle-controls');
		this.attachmentContainer = middleControls.createDiv('attachment-preview');
		this.attachmentContainer.addClass('ia-hidden');

		// Right section - Send info and stop button
		const rightControls = bottomControls.createDiv('bottom-right-controls');

		// Send hint
		this.sendHint = rightControls.createEl('span');
		this.sendHint.addClass('ia-send-hint');
		this.sendHint.setText('Press ');
		this.sendHint.createEl('kbd', { text: 'Enter' });
		this.sendHint.appendText(' to send');

		// Stop generation button (hidden by default)
		this.stopBtn = rightControls.createEl('button', { cls: 'stop-generation-btn' });
		setIcon(this.stopBtn, 'square');
		this.stopBtn.createSpan({ text: ' Stop' });
		this.stopBtn.addClass('ia-hidden');
		this.stopBtn.addEventListener('click', () => {
			this.state.stopStreamingRequested = true;
			if (this.stopBtn) this.stopBtn.addClass('ia-hidden');
			if (this.sendHint) this.sendHint.removeClass('ia-hidden');
			new Notice('Stopping generation...');
		});

		const sendMessage = async () => {
			const text = textarea.value.trim();
			if (!text && this.state.currentAttachments.length === 0 && this.state.referencedFiles.length === 0) return;

			textarea.value = '';
			textarea.setCssProps({ 'height': 'auto' });
			sendBtn.removeClass('is-active');
			await this.sendMessage(text);
			// Clear attachments and references after sending
			this.state.currentAttachments = [];
			this.state.referencedFiles = [];
			this.updateAttachmentPreview();
			this.updateReferenceDisplay();
		};

		textarea.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				void sendMessage();
			}
		});

		sendBtn.addEventListener('click', () => {
			void sendMessage();
		});

		// Styles are loaded from styles.css
		// this.addStyles();

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
			new Notice(`Rag initialization error: ${err.message}`);
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
		this.inputController.setInputElement(textarea);
		this.inputController.setAttachmentPreviewElement(this.attachmentContainer);
		this.chatController.configure({
			messagesContainer: this.chatContainer,
			messageController: this.messageController,
			agentController: this.agentController
		});

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
				new Notice('Models refreshed');
			}
		} catch (_error) {
			const err = _error instanceof Error ? _error : new Error(String(_error));
			console.error('Failed to refresh models:', err);
			if (showNotice) {
				new Notice(`Failed to refresh models: ${err.message}`);
			}
		}
	}

	private updateModelOptions() {
		this.modelSelect.empty();

		// Update model count
		if (this.modelCountEl) {
			this.modelCountEl.setText(`Models: ${this.state.availableModels.length}`);
		}

		if (this.state.availableModels.length === 0) {
			const option = this.modelSelect.createEl('option', { text: 'No models available' });
			option.value = '';
			option.disabled = true;
			if (this.modelCountEl) {
				this.modelCountEl.setText('Models: 0');
			}
			return;
		}

		const defaultModel = this.plugin.settings.defaultModel;

		// Group by provider
		const groupedModels = this.state.availableModels.reduce((acc, model) => {
			if (!acc[model.provider]) {
				acc[model.provider] = [];
			}
			acc[model.provider].push(model);
			return acc;
		}, {} as Record<string, ModelInfo[]>);

		// Sort providers: put providers with default model first
		const sortedProviders = Object.entries(groupedModels).sort(([providerA, modelsA], [providerB, modelsB]) => {
			const aHasDefault = modelsA.some(m => m.id === defaultModel);
			const bHasDefault = modelsB.some(m => m.id === defaultModel);
			if (aHasDefault && !bHasDefault) return -1;
			if (!aHasDefault && bHasDefault) return 1;
			return providerA.localeCompare(providerB);
		});

		// Add options grouped by provider
		sortedProviders.forEach(([provider, models]) => {
			const optgroup = this.modelSelect.createEl('optgroup');
			optgroup.label = `${provider.toUpperCase()} (${models.length})`;

			// Sort models: default first, then alphabetically
			const sortedModels = [...models].sort((a, b) => {
				if (a.id === defaultModel) return -1;
				if (b.id === defaultModel) return 1;
				return a.name.localeCompare(b.name);
			});

			sortedModels.forEach(model => {
				const isDefault = model.id === defaultModel;
				const option = optgroup.createEl('option', {
					text: isDefault ? `⭐ ${model.name ?? 'unknown'} (Default)` : model.name,
				});
				option.value = model.id;
				if (isDefault) {
					option.setCssProps({ 'font-weight': '600' });
				}
			});
		});
	}

	private async onModelChange() {
		// Model selection changed, update image button visibility based on vision capability
		await this.updateImageButtonVisibility();
	}

	private async updateImageButtonVisibility() {
		if (!this.imageActionItem) return;
		const selectedModel = this.modelSelect?.value || '';
		const supportsVision = selectedModel && await this.modelSupportsVision(selectedModel);
		const available = this.state.mode === 'chat' && supportsVision;
		this.imageActionItem.toggleClass('is-disabled', !available);
		const status = this.imageActionItem.querySelector('.header-action-status');
		if (status) {
			status.textContent = available ? 'Available' : 'Unavailable';
		}
	}

	private async modelSupportsVision(modelId: string): Promise<boolean> {
		// Find the model to check if it has vision capability
		const allModels = await ModelManager.getAllAvailableModels(this.plugin.settings.llmConfigs);
		const model = allModels.find(m => m.id === modelId);

		return model?.capabilities?.includes('vision') || false;
	}

	private async sendMessage(text: string) {
		console.debug('[Chat] sendMessage called with text:', text.substring(0, 100) + '...');

		// Check if a CLI agent is selected — route to CLI agent execution
		if (this.selectedCliAgentId) {
			const cliAgent = (this.plugin.settings.cliAgents ?? []).find(a => a.id === this.selectedCliAgentId);
			if (cliAgent) {
				await this.sendCLIAgentMessage(text, cliAgent);
				return;
			}
		}

		if (this.plugin.settings.llmConfigs.length === 0) {
			console.error('[Chat] No LLM configs found');
			new Notice('Please configure an LLM provider in settings first');
			return;
		}

		const selectedModel = this.modelSelect.value;
		console.debug('[Chat] Selected model:', selectedModel);

		if (!selectedModel) {
			console.error('[Chat] No model selected');
			new Notice('Please select a model');
			return;
		}

		const config = ModelManager.findConfigForModelByProvider(selectedModel, this.plugin.settings.llmConfigs);
		console.debug('[Chat] Found config:', config ? config.provider : 'none');

		if (!config) {
			console.error('[Chat] No config found for model:', selectedModel);
			new Notice('No valid provider configuration found for this model');
			return;
		}

		const { llmContent, references } = await this.buildReferenceContext(text, this.state.referencedFiles);

		const userMessage: Message = {
			role: 'user',
			content: text,
			attachments: this.state.currentAttachments.length > 0 ? [...this.state.currentAttachments] : undefined,
			references: references.length > 0 ? references : undefined
		};

		this.state.messages.push(userMessage);
		this.addMessageToUI(userMessage);

		try {
			await this.handleAssistantResponse({
				text,
				selectedModel,
				config,
				llmContent,
				targetMessage: userMessage
			});
		} catch (_error) {
			const errMsg = _error instanceof Error ? _error.message : String(_error);
			console.error('[Chat] Error during chat:', errMsg);
			new Notice(`Chat error: ${errMsg}`);

			// Do not remove the user message. Instead, add an error message.
			const errorMessage: Message = {
				role: 'assistant',
				content: `❌ **Error:** ${errMsg}`,
				model: selectedModel
			};
			(errorMessage as { provider?: string | null }).provider = config.provider ?? null;
			
			this.state.messages.push(errorMessage);
			this.addMessageToUI(errorMessage);
			
			// Save the conversation with the error
			await this.conversationManager.saveCurrentConversation();
		}
	}

	private async sendCLIAgentMessage(text: string, cliAgent: CLIAgentConfig) {
		const userMessage: Message = {
			role: 'user',
			content: text,
			attachments: this.state.currentAttachments.length > 0 ? [...this.state.currentAttachments] : undefined
		};
		this.state.messages.push(userMessage);
		this.addMessageToUI(userMessage);

		// Create assistant message placeholder
		const assistantMessage: Message = {
			role: 'assistant',
			content: '',
			model: `${cliAgent.provider}:${cliAgent.model || 'default'}`
		};
		this.state.messages.push(assistantMessage);
		const assistantMessageEl = this.addMessageToUI(assistantMessage);

		const contentEl = assistantMessageEl?.querySelector('.ia-chat-message__content') ?? null;
		const messageBody = assistantMessageEl?.querySelector('.ia-chat-message__body') ?? null;
		let fullContent = '';
		const executionSteps: AgentExecutionStep[] = [];

		// Create execution trace container for tool calls (inserted before content)
		let traceContainer: HTMLElement | null = null;
		if (messageBody && contentEl) {
			traceContainer = createAgentExecutionTraceContainer(messageBody as HTMLElement, 0);
			// Move trace before content element
			(messageBody as HTMLElement).insertBefore(traceContainer.parentElement!, contentEl);
		}

		try {
			this.state.isStreaming = true;
			this.state.stopStreamingRequested = false;
			if (this.stopBtn) this.stopBtn.removeClass('ia-hidden');
			if (this.sendHint) this.sendHint.addClass('ia-hidden');

			const abortController = new AbortController();

			// Wire stop button to abort controller
			const origStopHandler = () => {
				this.state.stopStreamingRequested = true;
				abortController.abort();
			};
			if (this.stopBtn) this.stopBtn.addEventListener('click', origStopHandler, { once: true });

			const vaultBasePath = this.app.vault.adapter instanceof FileSystemAdapter
				? this.app.vault.adapter.getBasePath()
				: undefined;
			const pluginDir = vaultBasePath
				? `${vaultBasePath}/${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}`
				: undefined;

			await this.cliAgentService.execute(
				cliAgent,
				text,
				(message: CLIAgentMessage) => {
					if (message.type === 'text' && message.content) {
						fullContent += message.content;
						if (contentEl) {
							contentEl.textContent = fullContent;
						}
						this.chatContainer.scrollTo({ top: this.chatContainer.scrollHeight, behavior: 'smooth' });
					} else if (message.type === 'tool-use') {
						const toolName = message.toolName ?? 'unknown';
						const step: AgentExecutionStep = {
							type: 'action',
							content: `${toolName}(${message.content})`,
							timestamp: Date.now(),
							status: 'success'
						};
						executionSteps.push(step);
						if (traceContainer) {
							updateExecutionTrace(traceContainer, executionSteps);
						}
						this.chatContainer.scrollTo({ top: this.chatContainer.scrollHeight, behavior: 'smooth' });
					} else if (message.type === 'error') {
						const step: AgentExecutionStep = {
							type: 'observation',
							content: message.content,
							timestamp: Date.now(),
							status: 'error'
						};
						executionSteps.push(step);
						if (traceContainer) {
							updateExecutionTrace(traceContainer, executionSteps);
						}
					}
				},
				abortController,
				vaultBasePath,
				pluginDir
			);

			assistantMessage.content = fullContent;
			assistantMessage.agentExecutionSteps = executionSteps.length > 0 ? executionSteps : undefined;

			// Collapse execution trace now that streaming is done
			if (traceContainer && executionSteps.length > 0) {
				collapseExecutionTrace(traceContainer);
			}
			// Hide trace container if no tool calls were made
			if (traceContainer && executionSteps.length === 0 && traceContainer.parentElement) {
				traceContainer.parentElement.setCssProps({ 'display': 'none' });
			}

			// Re-render content with markdown
			if (contentEl && fullContent) {
				this.renderMarkdownContent(contentEl as HTMLElement, fullContent);
			}

			await this.conversationManager.saveCurrentConversation();
		} catch (error) {
			const errMsg = error instanceof Error ? error.message : String(error);
			console.error('[Chat] CLI Agent error:', errMsg);
			new Notice(`CLI Agent error: ${errMsg}`);
			assistantMessage.content = fullContent || `❌ **Error:** ${errMsg}`;
			if (contentEl) {
				contentEl.textContent = assistantMessage.content;
			}
		} finally {
			this.state.isStreaming = false;
			this.state.stopStreamingRequested = false;
			if (this.stopBtn) this.stopBtn.addClass('ia-hidden');
			if (this.sendHint) this.sendHint.removeClass('ia-hidden');
		}
	}

	private async buildReferenceContext(
		text: string,
		referenceInputs: (TFile | TFolder | FileReference)[] = []
	): Promise<{ llmContent: string; references: FileReference[] }> {
		if (!referenceInputs || referenceInputs.length === 0) {
			return { llmContent: text, references: [] };
		}

		const references: FileReference[] = referenceInputs.map(item => {
			if (item instanceof TFile) {
				return { type: 'file', path: item.path, name: item.name };
			}
			if (item instanceof TFolder) {
				return { type: 'folder', path: item.path, name: item.name };
			}
			return item;
		});

		let llmContent = text + '\n\n---\n**Referenced Files/Folders:**\n\n';
		for (const ref of references) {
			if (ref.type === 'file') {
				const file = this.app.vault.getAbstractFileByPath(ref.path);
				if (file instanceof TFile) {
					try {
						const content = await this.app.vault.read(file);
						llmContent += `\n### 📄 ${ref.path ?? 'unknown'}\n`;
						llmContent += '```\n';
						llmContent += content;
						llmContent += '\n```\n';
					} catch (_error) {
						const errMsg = _error instanceof Error ? _error.message : String(_error);
						llmContent += `\n### 📄 ${ref.path ?? 'unknown'}\n`;
						llmContent += `*Error reading file: ${errMsg}*\n`;
					}
				} else {
					llmContent += `\n### 📄 ${ref.path ?? 'unknown'}\n`;
					llmContent += '*File not found*\n';
				}
			} else {
				const filesInFolder = this.app.vault.getFiles().filter(f => f.path.startsWith(ref.path));
				llmContent += `\n### 📁 ${ref.path ?? 'unknown'}\n`;
				llmContent += `Contains ${filesInFolder.length} file(s):\n`;
				filesInFolder.slice(0, 10).forEach(f => {
					llmContent += `- ${f.path ?? 'unknown'}\n`;
				});
				if (filesInFolder.length > 10) {
					llmContent += `... and ${filesInFolder.length - 10} more files\n`;
				}
			}
		}

		return { llmContent, references };
	}

	private async handleAssistantResponse(options: AssistantResponseOptions) {
		const { text, selectedModel, config, llmContent, targetMessage } = options;

		const modelConfig = {
			...config,
			model: selectedModel,
			temperature: this.state.temperature,
			maxTokens: this.state.maxTokens,
			topP: this.state.topP,
			frequencyPenalty: this.state.frequencyPenalty,
			presencePenalty: this.state.presencePenalty
		};

		const provider = ProviderFactory.createProvider(modelConfig);
		const systemMessages: Message[] = [];

		if (this.plugin.settings.activeSystemPromptId) {
			const activePrompt = this.plugin.settings.systemPrompts.find(
				p => p.id === this.plugin.settings.activeSystemPromptId
			);
			if (activePrompt && activePrompt.enabled) {
				systemMessages.push({
					role: 'system' as const,
					content: activePrompt.content
				});
			}
		}

		if (this.state.mode === 'agent') {
			const toolsList = this.toolManager.getAllTools().map(tool =>
				`- ${tool.definition.name}: ${tool.definition.description}`
			).join('\n');

			systemMessages.push({
				role: 'system' as const,
				content: `You are an AI agent with access to tools. You can call tools to help answer the user's questions.

Available tools:
${toolsList}

To call a tool, respond with a JSON block in this format:
\`\`\`json
{
  "name": "tool_name",
  "arguments": {
    "arg1": "value1",
    "arg2": "value2"
  }
}
\`\`\`

After calling a tool, you will receive the result and can continue the conversation or call another tool if needed.`
			});
		}

		let ragSources: import('@/types').RAGSource[] | undefined;
		console.debug('[RAG Debug] enableRAG:', this.state.enableRAG, 'ragConfig.enabled:', this.plugin.settings.ragConfig.enabled);
		if (this.state.enableRAG && this.plugin.settings.ragConfig.enabled) {
			try {
				console.debug('[RAG Debug] Querying RAG with text:', text);
				const searchResults = await this.ragManager.query(text);
				console.debug('[RAG Debug] Search results:', searchResults?.length || 0, 'results');
				if (searchResults && searchResults.length > 0) {
					ragSources = searchResults.map(result => ({
						path: result.chunk.metadata.path,
						content: result.chunk.content,
						similarity: result.similarity,
						title: result.chunk.metadata.title
					}));

					const ragContext = searchResults
						.map(result => `Document: ${result.chunk.metadata.path}\nContent: ${result.chunk.content}`)
						.join('\n\n');

					console.debug('[RAG Debug] RAG context length:', ragContext.length);
					systemMessages.push({
						role: 'system' as const,
						content: `RAG Context (retrieved from your vault):\n\n${ragContext}`
					});
				} else {
					console.debug('[RAG Debug] No search results found');
				}
			} catch (_error) {
				const errMsg = _error instanceof Error ? _error.message : String(_error);
				console.error('[RAG Debug] Error retrieving RAG context:', errMsg);
				new Notice(`Rag error: ${errMsg}`);
			}
		} else {
			console.debug('[RAG Debug] RAG is disabled');
		}

		let shouldPerformWebSearch = this.state.enableWebSearch;
		if (!shouldPerformWebSearch && this.plugin.settings.webSearchConfig.autoTrigger) {
			shouldPerformWebSearch = this.shouldAutoTriggerWebSearch(text);
		}

		let webSearchResults: import('@/types').WebSearchResult[] | undefined;
		if (shouldPerformWebSearch) {
			try {
				if (this.state.enableWebSearch) {
					new Notice('🔍 searching the web...');
				} else {
					console.debug('[WebSearch] Auto-triggered search for query:', text);
				}

				const results = await this.webSearchService.search(text);
				if (results && results.length > 0) {
					webSearchResults = results;
					const searchContext = this.webSearchService.formatResultsAsContext(results);
					systemMessages.push({
						role: 'system' as const,
						content: searchContext
					});

					if (this.state.enableWebSearch) {
						new Notice(`✅ found ${results.length} web results`);
					} else {
						console.debug(`[WebSearch] Auto-triggered: Found ${results.length} web results`);
					}
				} else if (this.state.enableWebSearch) {
					new Notice('No web results found for your query');
				}
			} catch (_error) {
				const errMsg = _error instanceof Error ? _error.message : String(_error);
				console.error('Error performing web search:', errMsg);
				if (this.state.enableWebSearch) {
					new Notice(`Web search error: ${errMsg}`);
				} else {
					console.error('[WebSearch] Auto-triggered search error:', errMsg);
				}
			}
		}

		const targetIndex = this.state.messages.indexOf(targetMessage);
		if (targetIndex === -1) {
			throw new Error('Unable to locate target message for response');
		}

		const llmMessages = this.state.messages.map((msg, index) => {
			const isTarget = index === targetIndex;
			let baseContent = isTarget ? llmContent : msg.content;

			if (!msg.attachments || msg.attachments.length === 0) {
				return { role: msg.role, content: baseContent, model: msg.model };
			}

			let formattedContent = baseContent;
			const fileAttachments = msg.attachments.filter(att => att.type === 'file');
			if (fileAttachments.length > 0) {
				formattedContent += '\n\n---\n**Attached Files:**\n\n';
				fileAttachments.forEach(att => {
					formattedContent += `\n### File: ${att.name ?? 'unknown'}\n`;
					formattedContent += `Path: ${att.path ?? 'unknown'}\n\n`;
					formattedContent += '```\n';
					formattedContent += att.content || '';
					formattedContent += '\n```\n';
				});
			}

			const imageAttachments = msg.attachments.filter(att => att.type === 'image');
			if (imageAttachments.length > 0) {
				formattedContent += '\n\n---\n**Attached Images:**\n\n';
				imageAttachments.forEach(att => {
					formattedContent += `- Image: ${att.name ?? 'unknown'} (Path: ${att.path})\n`;
				});
				formattedContent += '\n*Note: Image content cannot be processed by text-only models. Please describe what you need help with regarding these images.*\n';
			}

			return { role: msg.role, content: formattedContent, model: msg.model };
		});

		// Deduplicate and apply context window limit to conversation messages
		const activeAgent = this.getActiveAgent();
		const contextWindow = activeAgent?.contextWindow ?? 20;
		const dedupedLlmMessages = deduplicateMessages(llmMessages);
		const truncatedLlmMessages = dedupedLlmMessages.length > contextWindow
			? dedupedLlmMessages.slice(-contextWindow)
			: dedupedLlmMessages;

		const _finalMessages = [...systemMessages, ...truncatedLlmMessages];
		console.debug('[Chat] Final messages count:', _finalMessages.length, '(deduped from:', llmMessages.length, ', context window:', contextWindow, ')');

		let assistantMessageEl: HTMLElement | null = null;

		try {
			const placeholderAssistant: Message = {
				role: 'assistant',
				content: '',
				model: selectedModel
			};
			(placeholderAssistant as { provider?: string | null }).provider = config.provider ?? null;
			assistantMessageEl = this.addMessageToUI(placeholderAssistant);
			this.state.isStreaming = true;
			this.state.stopStreamingRequested = false;
			this.streamingMessageEl = assistantMessageEl;

			const streamingResult = await handleStreamingChat(
				assistantMessageEl,
				provider,
				{
					messages: _finalMessages,
					model: selectedModel,
					temperature: this.state.temperature,
					maxTokens: this.state.maxTokens,
					topP: this.state.topP,
					frequencyPenalty: this.state.frequencyPenalty,
					presencePenalty: this.state.presencePenalty
				},
				{
					chatContainer: this.chatContainer,
					stopBtn: this.stopBtn,
					sendHint: this.sendHint,
					onStopRequested: () => this.state.stopStreamingRequested,
					estimateTokens: this.estimateTokens.bind(this) as (text: string) => number,
					onScrollAwayChanged: (isAway: boolean) => {
						if (isAway) {
							this.scrollToBottomBtn.removeClass('ia-hidden');
						} else {
							this.scrollToBottomBtn.addClass('ia-hidden');
						}
					}
				}
			);

			const { fullContent, fullReasoning, promptTokens, completionTokens, totalTokens } = streamingResult;

			this.state.messages.push({
				role: 'assistant',
				content: fullContent,
				model: selectedModel,
				ragSources,
				webSearchResults,
				webSearchProvider: webSearchResults ? this.plugin.settings.webSearchConfig.provider : undefined,
				reasoningContent: fullReasoning || undefined,
				tokenUsage: {
					promptTokens,
					completionTokens,
					totalTokens
				}
			} as Message);

			this.updateTokenSummary();

			if (ragSources && ragSources.length > 0 && assistantMessageEl) {
				const messageBody = this.findMessageBodyElement(assistantMessageEl);
				if (messageBody) {
					this.displayRagSources(messageBody, ragSources);
				}
			}

			if (this.state.mode === 'agent' && assistantMessageEl) {
				this.state.agentExecutionSteps = [];
				const messageBody = this.findMessageBodyElement(assistantMessageEl);
				if (messageBody) {
					const contentEl = this.findMessageContentElement(assistantMessageEl);
					const traceContent = this.createAgentExecutionTraceContainer(messageBody);
					if (contentEl) {
						contentEl.empty(); // Clear raw streamed text; trace renders it in structured form
					}
					const toolsExecuted = await this.processToolCalls(fullContent, traceContent, contentEl || undefined);

					const countSpan = messageBody.querySelector('.agent-trace-count');
					if (countSpan) {
						countSpan.textContent = `${this.state.agentExecutionSteps.length} steps`;
					}

					// If no tools were called, this is already the final answer - show it and collapse trace
					// If tools were called, continuation flow handles final answer + collapse
					if (!toolsExecuted && contentEl) {
						this.displayAgentFinalAnswer(contentEl);
						collapseExecutionTrace(traceContent);
					}
				}
			}

			await this.conversationManager.saveCurrentConversation();
		} catch (_error) {
			if (assistantMessageEl && assistantMessageEl.isConnected) {
				assistantMessageEl.remove();
			}
			throw (_error instanceof Error ? _error : new Error(String(_error)));
		} finally {
			this.state.isStreaming = false;
			this.state.stopStreamingRequested = false;
			this.streamingMessageEl = null;
		}
	}

	/**
	 * Determines if web search should be automatically triggered based on the user's query
	 */
	private shouldAutoTriggerWebSearch(query: string): boolean {
		// Check if auto-trigger is enabled in settings
		if (!this.plugin.settings.webSearchConfig.autoTrigger) {
			return false;
		}

		// Use the same logic as in WebSearchService to determine if search is needed
		// However, we'll be more conservative in auto-triggering
		if (!query || typeof query !== 'string') {
			return false;
		}

		// Clean the input
		let cleanedQuery = query.trim();
		
		// Remove common prefixes that indicate search intent
		const searchIndicators = [
			'find:', 'search:', 'google:', 'bing:', 'search for:', 
			'look up:', 'find me:', 'find information about:'
		];
		
		for (const indicator of searchIndicators) {
			if (cleanedQuery.toLowerCase().startsWith(indicator)) {
				cleanedQuery = cleanedQuery.substring(indicator.length).trim();
				// If user explicitly indicated search, return true
				return true;
			}
		}

		// Filter out potentially harmful or inappropriate queries
		if (!this.isValidAutoSearchQuery(cleanedQuery)) {
			return false;
		}

		// Check if the query would benefit from a web search
		return this.isQuerySuitableForWebSearch(cleanedQuery);
	}

	/**
	 * Validate if the query is appropriate for auto web searching
	 */
	private isValidAutoSearchQuery(query: string): boolean {
		// Check for potentially harmful patterns
		const harmfulPatterns = [
			/^\s*execut/i,
			/^\s*system\(/,
			/^\s*eval\s*\(/,
			/^\s*import\s+/,
			/\b(os|sys|subprocess|exec|eval|import|require)\b/
		];

		for (const pattern of harmfulPatterns) {
			if (pattern.test(query)) {
				return false;
			}
		}

		// Check for very short or non-informational queries
		if (query.length < 3) {
			return false;
		}

		// Filter out conversational phrases that don't require search
		const nonInfoQueries = [
			'hello', 'hi', 'hey', 'ok', 'yes', 'no', 'thanks', 'thank you',
			'please', 'okay', 'cool', 'great', 'awesome', 'nice', 'good', 'bad',
			'bye', 'farewell', 'ciao'
		];

		const lowerQuery = query.toLowerCase().trim();
		if (nonInfoQueries.includes(lowerQuery)) {
			return false;
		}

		return true;
	}

	/**
	 * Determine if a query is suitable for web search using enhanced logic
	 */
	private isQuerySuitableForWebSearch(query: string): boolean {
		// Check for common informational patterns that suggest search would be helpful
		const infoPattern = /(?:what is|who is|how to|why is|when is|where is|define:|explain|tell me about|show me|find|information about|details on|facts about|latest news about|current status of|research on|study on|current (events|news|status)|recent (developments|updates|trends|happenings)|best (practices|ways|methods|options|deals|prices)|most (recent|popular|effective|trending)|need to know about|looking for information on|can you tell me|do you know|what are|what do you know about|what happened|what will happen|current|latest|new|today|now|recently|upcoming|tomorrow|yesterday|last week|last month|last year|next week|next month|next year|this week|this month|this year|202[0-9]|203[0-9]|prices? of|cost of|how much does|how many people|population of|distance between|weather in|temperature in|forecast for|election results|stock price|exchange rate|exchange rates|current exchange|current stock|crypto price|cryptocurrency price|currency rate|currency rates|covid|pandemic|coronavirus|virus|outbreak|inflation|interest rate|unemployment|gdp|economic|economy|jobs|employment|real estate|housing|market|financial|finance|investment|investing|bitcoin|ethereum|crypto|cryptocurrency|nft|web3|ai|artificial intelligence|machine learning|deep learning|climate change|global warming|renewable energy|solar|wind|electric car|tesla|spacex|elon musk|apple|google|amazon|microsoft|meta|facebook|netflix|tesla stock|crypto market|stock market|financial market|olympics|world cup|championship|tournament|league|nfl|nba|mlb|nhl|epl|uefa|fifa|super bowl|world series|stanley cup|wimbledon|us open|french open|australian open)\b/i;
		
		if (infoPattern.test(query)) {
			return true;
		}

		// Check for specific topics that typically require external knowledge
		const externalKnowledgePattern = /\b(news|events|updates|prices?|weather|stocks?|sports?|scores?|facts?|statistics|research|studies|science|technology|health|medical|law|policy|government|politics|finance|economics|education|university|school|history|geography|culture|art|music|movies?|tv|books?|authors?|celebrity|actors?|actresses?|products?|companies|reviews?|ratings?|restaurants|travel|vacation|hotel|flight|destination|temperature|climate|environment|pollution|climate change|election|president|prime minister|congress|parliament|senate|house of representatives|olympics|world cup|championship|awards?|prices?|cost|buy|where to|how much|how many|compare|versus|difference between|who won|who is the|who was the|when did|where is|what time|what date|current|latest|recent|new|upcoming|top|best|most popular|most common|most important|most significant|most influential|most famous|most successful|most powerful|most visited|largest|smallest|tallest|shortest|oldest|youngest|richest|poorest|fastest|slowest|strongest|weakest|highest|lowest|longest|shortest|heaviest|lightest|biggest|smallest|youngest|oldest|newest|earliest|latest|current|present|actual|real|true|correct|right|accurate|precise|exact|specific|detailed|comprehensive|thorough|complete|full|total|entire|whole|all|every|each|individual|particular|special|unique|distinct|different|various|multiple|several|many|much|lots of|plenty of|a lot of|tons of|tons|loads|loads of|abundant|numerous|countless|innumerable|myriad|multitude|plethora|slew|host|raft|bunch|group|collection|series|range|variety|assortment|selection|choice|menu|catalog|list|directory|guide|manual|handbook|book|volume|edition|version|type|kind|sort|form|shape|style|design|pattern|model|make|brand|manufacturer|producer|supplier|vendor|retailer|shop|store|market|bazaar|mall|center|plaza|complex|area|region|zone|district|neighborhood|locality|location|place|spot|position|site|venue|address|destination|goal|target|purpose|objective|aim|intention|plan|strategy|tactic|approach|method|way|manner|style|technique|procedure|process|operation|function|activity|action|movement|motion|change|development|progress|advancement|evolution|growth|expansion|improvement|enhancement|upgrade|update|revision|modification|adjustment|alteration|transformation|conversion|changeover|switch|replacement|substitute|alternative|option|possibility|chance|opportunity|prospect|potential|promise|hope|expectation|anticipation|prediction|forecast|estimate|calculation|computation|evaluation|assessment|analysis|examination|investigation|research|study|survey|poll|census|count|tally|total|sum|aggregate|amount|quantity|number|count|frequency|rate|ratio|proportion|percentage|fraction|decimal|figure|value|statistic|data|information|knowledge|facts|details|particulars|specifics|elements|components|parts|pieces|segments|sections|divisions|subdivisions|portions|shares|slices|bits|fragments|snippets|extracts|selections|samples|specimens|examples|instances|cases|situations|scenarios|contexts|circumstances|conditions|states|stages|phases|periods|eras|epochs|ages|times|moments|occasions|events|incidents|occurrences|happenings|affairs|matters|issues|problems|challenges|difficulties|obstacles|barriers|walls|fences|boundaries|limits|constraints|restrictions|limitations|rules|regulations|guidelines|principles|standards|criteria|benchmarks|measures|metrics|indicators|signs|symbols|marks|labels|tags|signs|notices|announcements|declarations|statements|pronouncements|proclamations|edicts|commands|orders|instructions|directives|guides|manuals|handbooks|instructions|directions|guidance|advice|counsel|suggestions|recommendations|tips|tricks|hacks|shortcuts|methods|ways|approaches|strategies|techniques|tactics|procedures|processes|operations|systems|methods|ways|approaches|strategies|techniques|tactics|procedures|processes|operations|systems|solutions|answers|responses|reactions|outcomes|results|products|effects|consequences|impacts|influences|effects|impacts|consequences|results|outcomes|products|effects|impacts|consequences|results|outcomes|products)\b/i;
		
		if (externalKnowledgePattern.test(query)) {
			return true;
		}

		// Check if query contains question words combined with likely search terms
		const questionWords = ['what', 'who', 'where', 'when', 'why', 'how'];
		const containsQuestionWord = questionWords.some(word => 
			query.toLowerCase().startsWith(word + ' ') || 
			query.toLowerCase().includes(' ' + word + ' '));
		
		if (containsQuestionWord && query.length > 10) { // Longer questions are more likely to need search
			return true;
		}

		// Check for time-sensitive queries
		const timeSensitivePattern = /\b(today|now|currently|recently|lately|just now|this (week|month|year|season|quarter)|last (week|month|year|season|quarter)|next (week|month|year|season|quarter)|current|latest|upcoming|tomorrow|yesterday|202[0-9]|203[0-9]|january|february|march|april|may|june|july|august|september|october|november|december|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|evening|night|day|week|month|year|season|quarter|fiscal year|calendar year|calendar month|calendar week)\b/i;
		if (timeSensitivePattern.test(query)) {
			return true;
		}

		// Check for queries that might need comparison
		const comparisonPattern = /\b(compare|versus|vs\.?|difference|differences|similarities|pros and cons|advantages and disadvantages|benefits and drawbacks|pros vs cons|advantages vs disadvantages|benefits vs drawbacks|better|worse|superior|inferior|preferred|recommended|top|best|worst|poorest|richest|fastest|slowest|tallest|shortest|largest|smallest|cheapest|most expensive|most expensive|least expensive|highest rated|lowest rated|most popular|least popular|most common|least common|most frequent|least frequent|most successful|least successful|most effective|least effective|most efficient|least efficient|most productive|least productive|most profitable|least profitable|most sustainable|least sustainable|most reliable|least reliable|most trusted|least trusted|most secure|least secure|most accurate|least accurate|most precise|least precise|most stable|least stable|most consistent|least consistent|most predictable|least predictable|most surprising|least surprising|most interesting|least interesting|most important|least important|most significant|least significant|most influential|least influential|most powerful|least powerful|most attractive|least attractive|most appealing|least appealing|most desirable|least desirable|most valuable|least valuable|most useful|least useful|most practical|least practical|most convenient|least convenient|most user-friendly|least user-friendly|most accessible|least accessible|most affordable|least affordable|most cost-effective|least cost-effective|most economical|least economical|most efficient|least efficient|most time-saving|least time-saving|most energy-saving|least energy-saving|most environmentally friendly|least environmentally friendly|most eco-friendly|least eco-friendly|most sustainable|least sustainable|most ethical|least ethical|most moral|least moral|most honest|least honest|most transparent|least transparent|most open|least open|most democratic|least democratic|most inclusive|least inclusive|most diverse|least diverse|most representative|least representative|most equal|least equal|most fair|least fair|most just|least just|most equitable|least equitable|most balanced|least balanced|most objective|least objective|most subjective|least subjective|most personal|least personal|most intimate|least intimate|most private|least private|most public|least public|most official|least official|most formal|least formal|most casual|least casual|most relaxed|least relaxed|most comfortable|least comfortable|most relaxing|least relaxing|most entertaining|least entertaining|most fun|least fun|most enjoyable|least enjoyable|most exciting|least exciting|most thrilling|least thrilling|most adventurous|least adventurous|most creative|least creative|most innovative|least innovative|most original|least original|most artistic|least artistic|most musical|least musical|most talented|least talented|most skilled|least skilled|most experienced|least experienced|most qualified|least qualified|most skilled|least skilled|most talented|least talented|most capable|least capable|most competent|least competent|most confident|least confident|most optimistic|least optimistic|most pessimistic|least pessimistic|most positive|least positive|most negative|least negative|most optimistic|least optimistic|most cheerful|least cheerful|most optimistic|least optimistic|most pessimistic|least pessimistic|most hopeful|least hopeful|most despairing|least despairing|most trusting|least trusting|most suspicious|least suspicious|most paranoid|least paranoid|most confident|least confident|most trusting|least trusting|most suspicious|least suspicious|most paranoid|least paranoid|most confident|least confident|most trusting|least trusting|most suspicious|least suspicious|most paranoid|least paranoid)\b/i;
		if (comparisonPattern.test(query)) {
			return true;
		}

		// If query is specific and long enough, it might need search
		if (query.length > 15) {
			return true;
		}

		return false;
	}

	private addMessageToUI(message: Message): HTMLElement {
		const callbacks: MessageRendererCallbacks = {
					saveMessageToNewNote: this.saveMessageToNewNote.bind(this) as (message: Message) => Promise<void>,
					insertMessageToNote: this.insertMessageToNote.bind(this) as (message: Message) => Promise<void>,
					regenerateMessage: this.regenerateMessage.bind(this) as (messageId: string) => Promise<void>,
					displayRagSources: this.displayRagSources.bind(this) as (sources: unknown[]) => void,
					getProviderAvatar: this.getProviderAvatar.bind(this) as (provider: string) => string,
					getProviderColor: this.getProviderColor.bind(this) as (provider: string) => string
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

		emptyEl.createEl('h3', { text: 'Start a conversation', cls: 'ia-chat-empty-state__heading' });
		emptyEl.createEl('p', {
			text: 'Type a message below to get started, or select a conversation from history.',
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
		btn.setCssProps({ 'padding': '2px 6px' });
		btn.setCssProps({ 'border': 'none' });
		btn.setCssProps({ 'background': 'transparent' });
		btn.addClass('ia-clickable');
		btn.setCssProps({ 'border-radius': '4px' });
		btn.setCssProps({ 'opacity': '0.6' });
		btn.setCssProps({ 'font-size': '14px' });
		btn.addEventListener('mouseenter', () => {
			btn.setCssProps({ 'opacity': '1' });
			btn.setCssProps({ 'background': 'var(--background-modifier-hover)' });
		});
		btn.addEventListener('mouseleave', () => {
			btn.setCssProps({ 'opacity': '0.6' });
			btn.setCssProps({ 'background': 'transparent' });
		});
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
				new Notice(`Added ${selectedItems.length} reference(s)`);
			}
		}).open();
	}

	private updateReferenceDisplay() {
		if (!this.referenceContainer) return;

		const _referenceList = this.referenceContainer.querySelector('.reference-list') as HTMLElement;
		if (!_referenceList) return;

		_referenceList.empty();

		if (this.state.referencedFiles.length === 0) {
			this.referenceContainer.addClass('ia-hidden');
			return;
		}

		this.referenceContainer.removeClass('ia-hidden');

		this.state.referencedFiles.forEach((item, index) => {
			const refItem = _referenceList.createDiv('reference-item');
			const icon = refItem.createSpan('reference-icon');
			icon.setText(item instanceof TFolder ? '📁' : '📄');
			const pathSpan = refItem.createSpan('reference-path');
			pathSpan.setText(item.path);

			// Make it clickable to open the file/folder
			refItem.addClass('ia-clickable');
			refItem.addEventListener('click', () => {
				if (item instanceof TFile) {
					void this.app.workspace.getLeaf().openFile(item);
				}
			});

			// Remove button
			const removeBtn = refItem.createEl('button', { text: '×' });
			removeBtn.addClass('reference-remove-btn');
			removeBtn.addEventListener('click', (e: MouseEvent) => {
				e.stopPropagation();
				this.state.referencedFiles.splice(index, 1);
				this.updateReferenceDisplay();
			});
		});
	}

	private async regenerateMessage(message: Message, messageEl?: HTMLElement) {
		if (message.role !== 'assistant') {
			return;
		}

		if (this.state.isStreaming) {
			new Notice('Please wait for the current response to finish');
			return;
		}

		const assistantIndex = this.state.messages.indexOf(message);
		if (assistantIndex === -1) {
			new Notice('Cannot find message to regenerate');
			return;
		}

		if (assistantIndex !== this.state.messages.length - 1) {
			new Notice('Only the most recent response can be regenerated right now');
			return;
		}

		const previousUser = this.findPreviousUserMessage(assistantIndex);
		if (!previousUser) {
			new Notice('Cannot find user message to regenerate from');
			return;
		}

		const selectedModel = this.modelSelect.value;
		if (!selectedModel) {
			new Notice('Please select a model');
			return;
		}

		const config = ModelManager.findConfigForModelByProvider(selectedModel, this.plugin.settings.llmConfigs);
		if (!config) {
			new Notice('No valid provider configuration found for this model');
			return;
		}

		const { llmContent } = await this.buildReferenceContext(
			previousUser.message.content,
			previousUser.message.references || []
		);

		if (messageEl?.isConnected) {
			messageEl.remove();
		}

		this.state.messages.splice(assistantIndex, 1);
		const originalAssistant = message;

		try {
			await this.handleAssistantResponse({
				text: previousUser.message.content,
				selectedModel,
				config,
				llmContent,
				targetMessage: previousUser.message
			});
			new Notice('Regenerated response');
		} catch (_error) {
			const errMsg = _error instanceof Error ? _error.message : String(_error);
			console.error('Regenerate error:', errMsg);
			new Notice(`Regenerate failed: ${errMsg}`);
			this.state.messages.push(originalAssistant);
			this.addMessageToUI(originalAssistant);
		}
	}

	private findPreviousUserMessage(startIndex: number): { message: Message; index: number } | null {
		for (let i = startIndex - 1; i >= 0; i--) {
			const candidate = this.state.messages[i];
			if (candidate.role === 'user') {
				return { message: candidate, index: i };
			}
		}
		return null;
	}

	private saveMessageToNewNote(message: Message) {
		// Use modal for input
		const defaultName = `Chat Message ${new Date().toLocaleDateString()}`;

		new TextInputModal(
			this.app,
			'Create New Note',
			'Enter note name',
			defaultName,
			(noteName) => {
				void (async () => {
					if (!noteName || !noteName.trim()) return;

					try {
						// Create note path (sanitize name)
						const fileName = noteName.replace(/[\\/:*?"<>|]/g, '-') + '.md';

						// Format content with metadata
						let content = `# ${noteName ?? 'unknown'}\n\n`;
						content += `Created from AI chat on ${new Date().toLocaleString()}\n\n`;
						content += `---\n\n`;

						// Add role header
						if (message.role === 'user') {
							content += `## 💬 User Message\n\n`;
						} else {
							const modelName = (message as { model?: string }).model || 'Assistant';
							content += `## 🤖 ${String(modelName)}\n\n`;
						}

						content += message.content + '\n';

						// Create the file
						await this.app.vault.create(fileName, content);
						new Notice(`Note created: ${fileName ?? 'unknown'}`);

						// Open the new note
						const file = this.app.vault.getAbstractFileByPath(fileName);
						if (file instanceof TFile) {
							await this.app.workspace.getLeaf(false).openFile(file);
						}
					} catch (_error) {
						const errMsg = _error instanceof Error ? _error.message : String(_error);
						console.error('Error creating note:', errMsg);
						new Notice('Failed to create note: ' + errMsg);
					}
				})();
			}
		).open();
	}

	private insertMessageToNote(message: Message) {
		new SingleFileSelectionModal(this.app, (selectedFile) => {
			void (async () => {
				if (selectedFile) {
					// insert into selected file
					try {
						// read current content
						let content = await this.app.vault.read(selectedFile);

						// add message content
						content += `\n\n---\n\n`;

						// add role header
						if (message.role === 'user') {
							content += `## 💬 User Message (${new Date().toLocaleString()})\n\n`;
						} else {
							const modelName = (message as { model?: string }).model || 'Assistant';
							content += `## 🤖 ${String(modelName)} (${new Date().toLocaleString()})\n\n`;
						}

						content += message.content + '\n';

						// Write back
						await this.app.vault.modify(selectedFile, content);
						new Notice(`Message inserted to: ${selectedFile.path ?? 'unknown'}`);

						// Open the file
						await this.app.workspace.getLeaf(false).openFile(selectedFile);
					} catch (_error) {
						const errMsg = _error instanceof Error ? _error.message : String(_error);
						console.error('Error inserting to note:', errMsg);
						new Notice('Failed to insert message: ' + errMsg);
					}
				} else {
					// create new note option was selected
					void this.saveMessageToNewNote(message);
				}
			})();
		}).open();
	}


	/**
	 * display rag sources in a message body
	 */
private displayRagSources(messageBody: HTMLElement, ragSources: import('@/types').RAGSource[]): void {
		// Remove existing RAG sources container if any
		const existingContainer = messageBody.querySelector('.rag-sources-container');
		if (existingContainer) {
			existingContainer.remove();
		}

		const ragSourcesContainer = messageBody.createDiv('rag-sources-container');

		// Header
		const header = ragSourcesContainer.createDiv('rag-sources-header');
		header.setText(`📚 retrieved from ${ragSources.length} document${ragSources.length > 1 ? 's' : ''}`);

		// Source cards
		const sourcesGrid = ragSourcesContainer.createDiv('rag-sources-grid');
		ragSources.forEach((source, _index) => {
			const sourceCard = sourcesGrid.createDiv('rag-source-card');

			// Title and similarity
			const sourceHeader = sourceCard.createDiv('rag-source-header');
			const titleEl = sourceHeader.createDiv('rag-source-title');
			titleEl.setText(source.title || source.path.split('/').pop() || source.path);

			const similarityEl = sourceHeader.createDiv('rag-source-similarity');
			const similarityPercent = Math.round(source.similarity * 100);
			similarityEl.setText(`${similarityPercent}%`);
			similarityEl.setCssProps({ 'color': similarityPercent > 80 ? 'var(--text-success)' :
										similarityPercent > 60 ? 'var(--text-accent)' :
										'var(--text-muted)' });

			// Path
			const pathEl = sourceCard.createDiv('rag-source-path');
			pathEl.setText(source.path);

			// Content preview
			const contentEl = sourceCard.createDiv('rag-source-content');
			const preview = source.content.length > 150
				? source.content.substring(0, 150) + '...'
				: source.content;
			contentEl.setText(preview);

			// Click to open
			sourceCard.addClass('ia-clickable');
			sourceCard.addEventListener('click', () => {
				void (async () => {
					const file = this.app.vault.getAbstractFileByPath(source.path);
					if (file instanceof TFile) {
						await this.app.workspace.getLeaf().openFile(file);
					} else {
						new Notice(`File not found: ${source.path ?? 'unknown'}`);
					}
				})();
			});

			// Hover effect
			sourceCard.addEventListener('mouseenter', () => {
				sourceCard.setCssProps({ 'border-color': 'var(--interactive-accent)' });
			});
			sourceCard.addEventListener('mouseleave', () => {
				sourceCard.setCssProps({ 'border-color': 'var(--background-modifier-border)' });
			});
		});
	}

	private createCheckbox(container: HTMLElement, label: string, checked: boolean, onChange: (checked: boolean) => void): HTMLInputElement {
		const checkboxContainer = container.createDiv('checkbox-container');
		const checkbox = checkboxContainer.createEl('input', { type: 'checkbox' });
		checkbox.checked = checked;
		checkbox.addEventListener('change', () => onChange(checkbox.checked));

		const labelEl = checkboxContainer.createEl('label');
		labelEl.setText(label);
		labelEl.setCssProps({ 'margin-left': '4px' });
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
			toggleBtn.setCssProps({ 'opacity': '0.5' });
			toggleBtn.setCssProps({ 'cursor': 'not-allowed' });
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
			const statusSpan = toggleBtn.createEl('span', { cls: 'toggle-status' });
			statusSpan.setText(` (${options.statusText ?? ''})`);
			statusSpan.setCssProps({ 'opacity': '0.7' });
			statusSpan.setCssProps({ 'font-size': '0.8em' });
			statusSpan.setCssProps({ 'margin-left': '4px' });
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
		const ragToggle = target ?? this.ragActionItem;
		if (!ragToggle) return;

		const statusSpanEl = ragToggle.querySelector('.header-action-status');
		const statusSpan = statusSpanEl instanceof HTMLElement ? statusSpanEl : null;
		const ragEnabledInSettings = this.plugin.settings.ragConfig.enabled;

		if (!ragEnabledInSettings) {
			ragToggle.addClass('is-disabled');
			ragToggle.setAttr('title', 'Enable RAG in Settings → Chat Features → RAG.');
			if (statusSpan) {
				statusSpan.textContent = 'Disabled';
				statusSpan.setCssProps({ 'cursor': 'not-allowed' });
				statusSpan.onclick = null;
			}
			return;
		}

		try {
			const stats = await this.ragManager.getDetailedStats();
			// Mark potential async UI interactions as intentionally unawaited
			ragToggle.removeClass('is-disabled');

			const ragActive = this.state.enableRAG && this.state.mode === 'chat';
			if (statusSpan) {
				if (ragActive) {
					const detail = stats.chunkCount > 0 ? `${stats.chunkCount} chunks` : 'No index';
					statusSpan.textContent = `On · ${detail}`;
				} else {
					statusSpan.textContent = 'Off';
				}
				statusSpan.setCssProps({ 'cursor': stats ? 'help' : 'default' });
				// Ensure onclick handler is synchronous; call async via void
				statusSpan.onclick = stats ? (event: MouseEvent) => {
					event.stopPropagation();
					void this.openRagStatsModal();
				} : null;
			}

			if (stats) {
				ragToggle.setAttr('title', this.buildRagTooltip(stats, ragActive));
			} else {
				ragToggle.removeAttribute('title');
			}
		} catch (_error) {
			ragToggle.addClass('is-disabled');
			if (statusSpan) {
				statusSpan.textContent = 'Unavailable';
				statusSpan.setCssProps({ 'cursor': 'not-allowed' });
				statusSpan.onclick = null;
			}
			const errMsg = _error instanceof Error ? _error.message : String(_error);
			console.error('Error updating RAG status:', errMsg);
		}
	}

	private buildRagTooltip(stats: RagIndexStats, ragActive: boolean): string {
		let tooltipText = `RAG Index Status:\n\n`;
		tooltipText += `📊 Total Chunks: ${stats.chunkCount}\n`;
		tooltipText += `📁 Files Indexed: ${stats.fileCount}\n`;
		tooltipText += `💾 Total Size: ${(stats.totalSize / 1024).toFixed(1)} KB\n`;

		if (stats.indexedFiles && stats.indexedFiles.length > 0) {
			tooltipText += `\n📄 indexed Files:\n`;
			const filesToShow = stats.indexedFiles.slice(0, 10);
			filesToShow.forEach(file => {
				const fileName = file.split('/').pop() || file;
					const displayName = fileName || 'unknown';
					tooltipText += `  • ${displayName}\n`;
			});

			if (stats.indexedFiles.length > 10) {
				const remainingCount = stats.indexedFiles.length - 10;
				tooltipText += `  ... and ${remainingCount} more\n`;
			}
		} else {
			tooltipText += `\n⚠️ no files indexed yet.\n`;
			tooltipText += `Go to Settings → RAG to build the index.`;
		}

		if (!ragActive) {
			tooltipText += `\n\nℹ️ RAG is currently turned off for this chat.`;
		}

		return tooltipText;
	}

	private async openRagStatsModal() {
		try {
			const stats = await this.ragManager.getDetailedStats();
			this.showRagStatsModal(stats);
		} catch (_error) {
			const errMsg = _error instanceof Error ? _error.message : String(_error);
			console.error('Error loading RAG stats modal:', errMsg);
			new Notice('Unable to load RAG statistics.');
		}
	}

	private showRagStatsModal(stats: RagIndexStats) {
		const modal = new Modal(this.app);
		modal.titleEl.setText('RAG statistics');

		const content = modal.contentEl;
		content.empty();
		content.addClass('rag-stats-modal');

		// Summary stats
		const summaryDiv = content.createDiv('rag-stats-summary');

		const row1 = summaryDiv.createDiv('stat-row');
		row1.createSpan({ cls: 'stat-label', text: '📊 total chunks:' });
		row1.createSpan({ cls: 'stat-value', text: `${stats.chunkCount}` });

		const row2 = summaryDiv.createDiv('stat-row');
		row2.createSpan({ cls: 'stat-label', text: '📁 files indexed:' });
		row2.createSpan({ cls: 'stat-value', text: `${stats.fileCount}` });

		const row3 = summaryDiv.createDiv('stat-row');
		row3.createSpan({ cls: 'stat-label', text: '💾 total size:' });
		row3.createSpan({ cls: 'stat-value', text: `${(stats.totalSize / 1024).toFixed(1)} KB` });

		const row4 = summaryDiv.createDiv('stat-row');
		row4.createSpan({ cls: 'stat-label', text: '📈 Avg Chunks/File:' });
		row4.createSpan({ cls: 'stat-value', text: `${stats.fileCount > 0 ? (stats.chunkCount / stats.fileCount).toFixed(1) : '0'}` });

		// File list
		if (stats.indexedFiles && stats.indexedFiles.length > 0) {
			const filesDiv = content.createDiv('rag-stats-files');
			filesDiv.createEl('h4', { text: '📄 indexed files' });

			const fileList = filesDiv.createDiv('rag-file-list');
			stats.indexedFiles.forEach(filePath => {
				const fileItem = fileList.createDiv('rag-file-item');
				const fileName = filePath.split('/').pop() || filePath;
				const fileLink = fileItem.createEl('a', {
					text: fileName,
					cls: 'rag-file-link'
				});
				fileLink.title = filePath;
				fileLink.addEventListener('click', (e) => {
					e.preventDefault();
					void (async () => {
						const file = this.app.vault.getAbstractFileByPath(filePath);
						if (file instanceof TFile) {
							await this.app.workspace.getLeaf().openFile(file);
							modal.close();
						} else {
							new Notice(`File not found: ${filePath ?? 'unknown'}`);
						}
					})();
				});

				fileItem.createEl('span', {
					text: filePath,
					cls: 'rag-file-path'
				});
			});
		} else {
			const noFiles = content.createDiv('rag-no-files');
			noFiles.createEl('p', { text: '⚠️ no files have been indexed yet.' });
			noFiles.createEl('p', { text: 'To build the RAG index:' });
			const ol = noFiles.createEl('ol');
			ol.createEl('li', { text: 'Go to Settings → RAG' });
			ol.createEl('li', { text: 'Enable RAG' });
			ol.createEl('li', { text: 'Select index vault' });
		}

		// Close button
		const btnContainer = content.createDiv('modal-button-container');
		const closeBtn = btnContainer.createEl('button', { text: 'Close', cls: 'mod-cta' });
		closeBtn.addEventListener('click', () => modal.close());

		modal.open();
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
		if (!this.tokenSummaryEl) return;

		let totalPromptTokens = 0;
		let totalCompletionTokens = 0;
		let totalTokens = 0;

		for (const message of this.state.messages) {
			if (message.role === 'assistant' && message.tokenUsage) {
				totalPromptTokens += message.tokenUsage.promptTokens || 0;
				totalCompletionTokens += message.tokenUsage.completionTokens || 0;
				totalTokens += message.tokenUsage.totalTokens || 0;
			}
		}

		// Format the display text
		if (totalTokens > 0) {
			this.tokenSummaryEl.setText(`Tokens: ${totalTokens} (${totalPromptTokens} input + ${totalCompletionTokens} output)`);
		} else {
			this.tokenSummaryEl.setText('Tokens: 0');
		}
	}

	private async updateOptionsDisplay() {
		if (this.headerActionsContainer) {
			this.headerActionsContainer.setCssProps({ 'display': this.state.mode === 'agent' ? 'none' : '' });
		}

		this.updatePromptSelectorVisibility();
		this.updateAgentSelectorVisibility();
		await this.updateQuickActionsState();
		this.updateModelControlDisplay();
	}

	private updatePromptSelectorVisibility() {
		if (!this.promptSelector) return;
		if (this.state.mode === 'agent') {
			this.promptSelector.addClass('ia-hidden');
			this.promptSelector.disabled = true;
			if (this.promptSelectorGroup) this.promptSelectorGroup.addClass('ia-hidden');
		} else {
			this.promptSelector.setCssProps({ 'display': '' });
			this.promptSelector.disabled = false;
			if (this.promptSelectorGroup) this.promptSelectorGroup.setCssProps({ 'display': '' });
		}
	}

	private updateAgentSelectorVisibility() {
		if (!this.agentSelector) return;
		if (this.state.mode === 'agent') {
			const wasDisabled = this.agentSelector.disabled;
			this.agentSelector.removeClass('ia-hidden');
			this.agentSelector.setCssProps({ 'display': '' });
			this.agentSelector.disabled = false;
			if (this.agentSelectorGroup) {
				this.agentSelectorGroup.removeClass('ia-hidden');
				this.agentSelectorGroup.setCssProps({ 'display': '' });
			}
			if (wasDisabled) {
				this.refreshAgentSelect();
			}
		} else {
			this.agentSelector.addClass('ia-hidden');
			this.agentSelector.disabled = true;
			if (this.agentSelectorGroup) this.agentSelectorGroup.addClass('ia-hidden');
		}
	}

	private getActiveAgent(): Agent | null {
		const activeId = this.plugin.settings.activeAgentId;
		if (!activeId) return null;
		return this.plugin.settings.agents.find(agent => agent.id === activeId) || null;
	}

	private updateModelControlDisplay() {
		const isAgentMode = this.state.mode === 'agent';
		const isCliAgent = !!this.selectedCliAgentId;
		const activeAgent = this.getActiveAgent();
		const usesChatViewModel = activeAgent?.modelStrategy?.strategy === 'chat-view';
		const showControls = !isAgentMode || (!activeAgent && !isCliAgent) || usesChatViewModel;

		if (this.modelControlsContainer) {
			this.modelControlsContainer.setCssProps({ 'display': showControls ? '' : 'none' });
		}
		if (this.modelSelect) {
			this.modelSelect.disabled = !showControls;
		}
		if (this.temperatureSlider) {
			this.temperatureSlider.disabled = !showControls;
		}
		if (this.maxTokensInput) {
			this.maxTokensInput.disabled = !showControls;
		}

		const shouldShowSummary = isAgentMode && (!!activeAgent || isCliAgent) && !usesChatViewModel;
			if (this.agentConfigSummaryEl) {
				this.agentConfigSummaryEl.setCssProps({ 'display': shouldShowSummary ? 'flex' : 'none' });
			}
		if (shouldShowSummary && activeAgent) {
			this.renderAgentSummary(activeAgent);
		} else if (shouldShowSummary && isCliAgent) {
			this.renderCliAgentSummary();
		}
	}

	private renderAgentSummary(agent: Agent) {
		if (!this.agentSummaryDetailsEl) return;
		if (this.agentSummaryTitleEl) {
			this.agentSummaryTitleEl.setText(`${agent.icon || '🤖'} ${agent.name ?? 'unknown'} configuration`);
		}

		this.agentSummaryDetailsEl.empty();
		const chips = [
			{ label: 'Model', value: this.getAgentModelSummary(agent) },
			{ label: 'Temp', value: this.formatTemperature(agent.temperature) },
			{ label: 'Max', value: this.formatTokenLimit(agent.maxTokens) },
			{ label: 'RAG', value: this.formatToggleStatus(agent.ragEnabled) },
			{ label: 'Web', value: this.formatToggleStatus(agent.webSearchEnabled) },
			{ label: 'Tools', value: this.getAgentToolsLabel(agent) },
			{ label: 'Memory', value: this.getAgentMemoryLabel(agent) }
		];

		chips
			.filter(chip => chip.value && chip.value.trim().length > 0)
			.forEach(({ label, value }) => this.createAgentSummaryChip(label, value));
	}

	private renderCliAgentSummary() {
		if (!this.agentSummaryDetailsEl) return;
		const cliAgent = (this.plugin.settings.cliAgents ?? []).find(a => a.id === this.selectedCliAgentId);
		if (!cliAgent) return;

		if (this.agentSummaryTitleEl) {
			this.agentSummaryTitleEl.setText(`${cliAgent.icon || '⚡'} ${cliAgent.name} configuration`);
		}

		this.agentSummaryDetailsEl.empty();
		const chips: { label: string; value: string }[] = [
			{ label: 'Provider', value: cliAgent.provider },
			{ label: 'Model', value: cliAgent.model || 'default' },
			{ label: 'Mode', value: cliAgent.permissionMode }
		];
		if (cliAgent.maxTurns) chips.push({ label: 'Max turns', value: String(cliAgent.maxTurns) });
		if (cliAgent.cwd) chips.push({ label: 'CWD', value: cliAgent.cwd });

		chips.forEach(({ label, value }) => this.createAgentSummaryChip(label, value));
	}

	private createAgentSummaryChip(label: string, value: string) {
		if (!this.agentSummaryDetailsEl) return;
		const chip = this.agentSummaryDetailsEl.createSpan({ cls: 'chat-agent-chip' });
		chip.createSpan({ cls: 'chat-agent-chip-label', text: label });
		chip.createSpan({ cls: 'chat-agent-chip-value', text: value });
	}

	private getAgentModelSummary(agent: Agent): string {
		const strategy = agent.modelStrategy?.strategy ?? 'fixed';
		if (strategy === 'fixed') {
			const fixedId = agent.modelStrategy.modelId || '';
			const name = fixedId ? this.getModelDisplayName(fixedId) : 'Custom model';
			return `${name ?? 'unknown'} · Fixed`;
		}
		if (strategy === 'default') {
			const defaultId = this.plugin.settings.defaultModel || '';
			const name = defaultId ? this.getModelDisplayName(defaultId) : 'Not set';
			return `${name ?? 'unknown'} · Default`;
		}
		const currentId = this.modelSelect?.value || this.plugin.settings.defaultModel || '';
		const name = currentId ? this.getModelDisplayName(currentId) : 'Chat view model';
		return `${name ?? 'unknown'} · Chat View`;
	}

	private getModelDisplayName(modelId: string | null | undefined): string {
		if (!modelId) return 'Not set';
		const match = this.state.availableModels.find(model => model.id === modelId);
		return match?.name || modelId;
	}

	private formatTokenLimit(value: number): string {
		return value > 0 ? value.toLocaleString() : 'Auto';
	}

	private formatToggleStatus(enabled: boolean): string {
		return enabled ? 'On' : 'Off';
	}

	private getAgentToolsLabel(agent: Agent): string {
		const builtIn = agent.enabledBuiltInTools.length;
		const mcp = agent.enabledMcpServers.length;
		const cliTools = this.plugin.settings.cliTools?.filter(t => t.enabled) ?? [];
		const cli = agent.enabledAllCLITools ? cliTools.length : (agent.enabledCLITools?.filter(id => cliTools.some(t => t.id === id)).length ?? 0);
		const segments = [] as string[];
		if (builtIn > 0) segments.push(`${builtIn} built-in`);
		if (mcp > 0) segments.push(`${mcp} MCP`);
		if (cli > 0) segments.push(`${cli} CLI`);
		if (segments.length === 0) {
			return 'None';
		}
		return segments.join(' + ');
	}

	private getAgentMemoryLabel(agent: Agent): string {
		switch (agent.memoryType) {
			case 'short-term':
				return 'Short-term';
			case 'long-term':
				return 'Long-term';
			default:
				return 'Disabled';
		}
	}

	private formatTemperature(value: number): string {
		return Number.isInteger(value)
			? value.toString()
			: value.toFixed(1).replace(/0+$/, '').replace(/\.$/, '');
	}

	private updateTemperatureDisplay(value: number) {
		if (this.temperatureSlider) {
			this.temperatureSlider.value = value.toString();
		}
		if (this.temperatureValueEl) {
			this.temperatureValueEl.setText(this.formatTemperature(value));
		}
	}

	private createTopControls(parent: HTMLElement) {
		const topControls = parent.createDiv('chat-top-controls');
		topControls.addClass('chat-top-controls');

		const modeGroup = topControls.createDiv('chat-select-group');
		modeGroup.addClass('chat-select-group');
		modeGroup.createSpan({ text: 'Mode', cls: 'chat-label' });
		this.modeSelector = modeGroup.createEl('select', { cls: 'mode-selector' });
		this.modeSelector.createEl('option', { value: 'chat', text: 'Chat' });
		this.modeSelector.createEl('option', { value: 'agent', text: 'Agent' });
		this.modeSelector.value = this.state.mode;
		this.modeSelector.addEventListener('change', () => {
			const value = (this.modeSelector?.value ?? 'chat') as 'chat' | 'agent';
			void this.handleModeChange(value);
		});

		this.promptSelectorGroup = topControls.createDiv('chat-select-group');
		this.promptSelectorGroup.addClass('chat-select-group');
		this.promptSelectorGroup.createSpan({ text: 'Prompt', cls: 'chat-label' });
		this.promptSelector = this.promptSelectorGroup.createEl('select', { cls: 'prompt-selector' });
		this.populatePromptSelectorOptions();
		this.promptSelector.addEventListener('change', () => {
			this.plugin.settings.activeSystemPromptId = this.promptSelector?.value || null;
			void this.plugin.saveSettings();
		});

		this.agentSelectorGroup = topControls.createDiv('chat-select-group');
		this.agentSelectorGroup.addClass('chat-select-group');
		this.agentSelectorGroup.createSpan({ text: 'Agent', cls: 'chat-label' });
		this.agentSelector = this.agentSelectorGroup.createEl('select', { cls: 'agent-selector' });
		this.agentSelector.addEventListener('change', () => {
			void this.handleAgentSelection(this.agentSelector?.value ?? '');
		});

		this.refreshAgentSelect();
		this.updatePromptSelectorVisibility();
		this.updateAgentSelectorVisibility();
	}

	private populatePromptSelectorOptions() {
		if (!this.promptSelector) return;
		const enabledPrompts = this.plugin.settings.systemPrompts.filter(p => p.enabled);
		this.promptSelector.empty();
		this.promptSelector.createEl('option', { value: '', text: 'No system prompt' });
		enabledPrompts.forEach(p => {
			const option = this.promptSelector!.createEl('option', { value: p.id, text: p.name });
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
				new Notice('No agents available. Configure agents in Settings → Agents.');
				if (this.plugin.settings.activeAgentId) {
					this.plugin.settings.activeAgentId = null;
					await this.plugin.saveSettings();
				}
				this.refreshAgentSelect();
			}
		}

		if (this.modeSelector) {
			this.modeSelector.value = mode;
		}

		await this.updateOptionsDisplay();
	}

	private async handleAgentSelection(selectedId: string) {
		this.state.mode = 'agent';
		if (this.modeSelector) {
			this.modeSelector.value = 'agent';
		}

		// Check if a CLI agent was selected (prefixed with "cli:")
		if (selectedId.startsWith('cli:')) {
			const cliAgentId = selectedId.slice(4);
			this.selectedCliAgentId = cliAgentId;
			this.state.selectedCliAgentId = cliAgentId;
			this.plugin.settings.activeAgentId = null;
			await this.plugin.saveSettings();
			await this.updateOptionsDisplay();
			return;
		}

		// Regular agent selected - clear CLI agent selection
		this.selectedCliAgentId = null;
		this.state.selectedCliAgentId = null;

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
		if (this.conversationTitleEl) {
			this.conversationTitleEl.setText(title || 'Current Conversation');
		}
	}

	private async applyConversationConfig(conv: Conversation) {
		if (this.modeSelector) {
			this.modeSelector.value = this.state.mode;
		}

		const config = conv.config;
		if (!config) {
			await this.updateOptionsDisplay();
			return;
		}

		let settingsDirty = false;

		if (this.state.mode === 'agent') {
			// Check if this is a CLI agent conversation
			let cliAgentId = config.cliAgentId ?? null;
			const cliAgents = this.plugin.settings.cliAgents ?? [];

			// Fallback: infer CLI agent from message model field for old conversations
			if (!cliAgentId && conv.messages.length > 0) {
				const CLI_PREFIXES = ['claude-code:', 'codex:', 'qwen-code:'];
				const cliMsg = conv.messages.find(m =>
					m.role === 'assistant' && m.model && CLI_PREFIXES.some(p => m.model?.startsWith(p))
				);
				if (cliMsg?.model) {
					const providerPrefix = cliMsg.model.split(':')[0] as import('@/types').CLIAgentProvider;
					const matchedAgent = cliAgents.find(a => a.provider === providerPrefix);
					if (matchedAgent) cliAgentId = matchedAgent.id;
				}
			}

			if (cliAgentId && cliAgents.some(a => a.id === cliAgentId)) {
				// Restore CLI agent selection
				this.selectedCliAgentId = cliAgentId;
				this.state.selectedCliAgentId = cliAgentId;
				this.plugin.settings.activeAgentId = null;
				settingsDirty = true;

				this.refreshAgentSelect();
				if (this.agentSelector) {
					this.agentSelector.value = `cli:${cliAgentId}`;
				}
			} else {
				// Regular agent
				this.selectedCliAgentId = null;
				this.state.selectedCliAgentId = null;

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
				if (this.agentSelector) {
					this.agentSelector.value = desiredAgentId || '';
				}
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
			if (this.promptSelector) {
				this.promptSelector.value = promptToUse;
			}
			if (this.agentSelector) {
				this.agentSelector.value = '';
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
			if (this.maxTokensInput) {
				this.maxTokensInput.value = config.maxTokens.toString();
			}
		}
		if (typeof config.topP === 'number') {
			this.state.topP = config.topP;
			if (this.topPSlider) this.topPSlider.value = config.topP.toString();
			if (this.topPValueEl) this.topPValueEl.setText(config.topP.toFixed(2));
		}
		if (typeof config.frequencyPenalty === 'number') {
			this.state.frequencyPenalty = config.frequencyPenalty;
			if (this.frequencyPenaltySlider) this.frequencyPenaltySlider.value = config.frequencyPenalty.toString();
			if (this.frequencyPenaltyValueEl) this.frequencyPenaltyValueEl.setText(config.frequencyPenalty.toFixed(1));
		}
		if (typeof config.presencePenalty === 'number') {
			this.state.presencePenalty = config.presencePenalty;
			if (this.presencePenaltySlider) this.presencePenaltySlider.value = config.presencePenalty.toString();
			if (this.presencePenaltyValueEl) this.presencePenaltyValueEl.setText(config.presencePenalty.toFixed(1));
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
			if (this.modeSelector) this.modeSelector.value = 'agent';
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
				if (this.agentSelector) this.agentSelector.value = agentId;
			} else {
				if (this.plugin.settings.activeAgentId) {
					this.plugin.settings.activeAgentId = null;
					settingsDirty = true;
				}
			}
			if (this.promptSelector) {
				this.promptSelector.value = '';
			}
			if (this.plugin.settings.activeSystemPromptId !== null) {
				this.plugin.settings.activeSystemPromptId = null;
				settingsDirty = true;
			}
		} else {
			this.state.mode = 'chat';
			if (this.modeSelector) this.modeSelector.value = 'chat';
			if (this.plugin.settings.activeAgentId) {
				this.plugin.settings.activeAgentId = null;
				settingsDirty = true;
			}
			this.refreshAgentSelect();
			if (this.agentSelector) this.agentSelector.value = '';
			if (this.plugin.settings.activeSystemPromptId !== null) {
				this.plugin.settings.activeSystemPromptId = null;
				settingsDirty = true;
			}
			if (this.promptSelector) {
				this.promptSelector.value = '';
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
			if (this.maxTokensInput) {
				this.maxTokensInput.value = defaultMaxTokens.toString();
			}

			const defaultTopP = 1.0;
			this.state.topP = defaultTopP;
			if (this.topPSlider) this.topPSlider.value = defaultTopP.toString();
			if (this.topPValueEl) this.topPValueEl.setText(defaultTopP.toFixed(2));

			const defaultPenalty = 0;
			this.state.frequencyPenalty = defaultPenalty;
			if (this.frequencyPenaltySlider) this.frequencyPenaltySlider.value = defaultPenalty.toString();
			if (this.frequencyPenaltyValueEl) this.frequencyPenaltyValueEl.setText(defaultPenalty.toFixed(1));

			this.state.presencePenalty = defaultPenalty;
			if (this.presencePenaltySlider) this.presencePenaltySlider.value = defaultPenalty.toString();
			if (this.presencePenaltyValueEl) this.presencePenaltyValueEl.setText(defaultPenalty.toFixed(1));

			this.state.enableRAG = false;
			this.state.enableWebSearch = false;
		}

		if (settingsDirty) {
			await this.plugin.saveSettings();
		}
		await this.updateOptionsDisplay();
	}

	private createActionRow(parent: HTMLElement) {
		const row = parent.createDiv('chat-action-row');

		const breadcrumb = row.createDiv('chat-breadcrumb');
		const historyLink = breadcrumb.createSpan({ cls: 'chat-breadcrumb-link chat-action-btn' });
		setIcon(historyLink.createSpan({ cls: 'chat-action-icon' }), 'list');
		historyLink.createSpan({ text: 'Conversations', cls: 'chat-action-text' });
		historyLink.setAttr('role', 'button');
		historyLink.tabIndex = 0;
		const activateHistory = async (event: Event) => {
			event.preventDefault();
			event.stopPropagation();
			await this.toggleConversationListVisibility();
		};
		historyLink.addEventListener('click', (event: MouseEvent) => { void activateHistory(event); });
		historyLink.addEventListener('keydown', (event: KeyboardEvent) => {
			if (event.key === 'Enter' || event.key === ' ') {
				void activateHistory(event);
			}
		});
		breadcrumb.createSpan({ text: '/', cls: 'chat-breadcrumb-sep' });
		this.conversationTitleEl = breadcrumb.createSpan({ text: 'Current conversation', cls: 'chat-breadcrumb-current' });

		const actions = row.createDiv('chat-action-buttons');

		const newLink = actions.createSpan({ cls: 'chat-action-btn' });
		setIcon(newLink.createSpan({ cls: 'chat-action-icon' }), 'plus');
		newLink.createSpan({ text: 'New', cls: 'chat-action-text' });
		newLink.setAttr('role', 'button');
		newLink.tabIndex = 0;
		const activateNew = async (event: Event) => {
			event.preventDefault();
			event.stopPropagation();
			await this.resetToDefaultChatConfiguration();
			await this.conversationManager.createNewConversation();
		};
		newLink.addEventListener('click', (event: MouseEvent) => { void activateNew(event); });
		newLink.addEventListener('keydown', (event: KeyboardEvent) => {
			if (event.key === 'Enter' || event.key === ' ') {
				void activateNew(event);
			}
		});

		const settingsLink = actions.createSpan({ cls: 'chat-action-btn' });
		setIcon(settingsLink.createSpan({ cls: 'chat-action-icon' }), 'settings');
		settingsLink.createSpan({ text: 'Settings', cls: 'chat-action-text' });
		settingsLink.setAttr('role', 'button');
		settingsLink.tabIndex = 0;
		const activateSettings = (event: Event) => {
			event.preventDefault();
			event.stopPropagation();
			const settingApi = (this.app as unknown as { setting?: { open: () => void; openTabById: (id: string) => void } }).setting;
			if (settingApi) {
				settingApi.open();
				settingApi.openTabById('intelligence-assistant');
			} else {
				new Notice('Settings API unavailable');
			}
		};
		settingsLink.addEventListener('click', activateSettings);
		settingsLink.addEventListener('keydown', (event: KeyboardEvent) => {
			if (event.key === 'Enter' || event.key === ' ') {
				activateSettings(event);
			}
		});
	}

	private createModelRow(parent: HTMLElement) {
		const row = parent.createDiv('chat-model-row');

		this.modelControlsContainer = row.createDiv('chat-model-controls');
		this.modelControlsContainer.addClass('ia-chat-model-controls');

		const modelGroup = this.modelControlsContainer.createDiv('chat-select-group');
		modelGroup.addClass('ia-model-select-group');
		modelGroup.addClass('chat-model-select');
		modelGroup.createSpan({ text: 'Model', cls: 'chat-label' });
		this.modelSelect = modelGroup.createEl('select', { cls: 'model-select' });
		this.modelSelect.addClass('ia-model-select');
		this.modelSelect.addEventListener('change', () => {
			void this.onModelChange();
		});

		// Settings toggle button
		const settingsBtn = this.modelControlsContainer.createEl('button', { cls: 'chat-params-toggle' });
		setIcon(settingsBtn, 'sliders-horizontal');
		settingsBtn.title = 'Advanced parameters';
		settingsBtn.addClass('ia-icon-btn');

		// Container for advanced params (overlay, hidden by default)
		const paramsContainer = this.modelControlsContainer.createDiv('chat-params-container');
		paramsContainer.addClass('ia-hidden');

		settingsBtn.addEventListener('click', () => {
			const isHidden = paramsContainer.hasClass('ia-hidden');
			if (isHidden) {
				paramsContainer.removeClass('ia-hidden');
				settingsBtn.addClass('is-active');
			} else {
				paramsContainer.addClass('ia-hidden');
				settingsBtn.removeClass('is-active');
			}
		});

		const tempGroup = paramsContainer.createDiv('chat-param-group');
		tempGroup.addClass('chat-param-group');
		tempGroup.createSpan({ text: 'Temperature', cls: 'chat-label' });
		this.temperatureSlider = tempGroup.createEl('input', { type: 'range' });
		this.temperatureSlider.min = '0';
		this.temperatureSlider.max = '2';
		this.temperatureSlider.step = '0.1';
		this.temperatureSlider.value = this.state.temperature.toString();
		this.temperatureSlider.addClass('chat-slider');
		this.temperatureValueEl = tempGroup.createSpan({ text: this.formatTemperature(this.state.temperature), cls: 'chat-param-value' });
		this.temperatureSlider.addEventListener('input', () => {
			this.state.temperature = parseFloat(this.temperatureSlider.value);
			this.updateTemperatureDisplay(this.state.temperature);
		});

		const tokensGroup = paramsContainer.createDiv('chat-param-group');
		tokensGroup.addClass('chat-param-group');
		tokensGroup.createSpan({ text: 'Max tokens', cls: 'chat-label' });
		this.maxTokensInput = tokensGroup.createEl('input', { type: 'number', cls: 'chat-number-input' });
		this.maxTokensInput.min = '100';
		this.maxTokensInput.max = '100000';
		this.maxTokensInput.step = '100';
		this.maxTokensInput.value = this.state.maxTokens.toString();
		this.maxTokensInput.addEventListener('input', () => {
			const value = parseInt(this.maxTokensInput.value);
			if (!isNaN(value) && value > 0) {
				this.state.maxTokens = value;
			}
		});

		// Top P
		const topPGroup = paramsContainer.createDiv('chat-param-group');
		topPGroup.addClass('chat-param-group');
		topPGroup.createSpan({ text: 'Top P', cls: 'chat-label' });
		this.topPSlider = topPGroup.createEl('input', { type: 'range' });
		this.topPSlider.min = '0';
		this.topPSlider.max = '1';
		this.topPSlider.step = '0.05';
		this.topPSlider.value = this.state.topP.toString();
		this.topPSlider.addClass('chat-slider');
		this.topPValueEl = topPGroup.createSpan({ text: this.state.topP.toFixed(2), cls: 'chat-param-value' });
		this.topPSlider.addEventListener('input', () => {
			const val = parseFloat(this.topPSlider!.value);
			this.state.topP = val;
			this.topPValueEl!.setText(val.toFixed(2));
		});

		// Frequency Penalty
		const freqGroup = paramsContainer.createDiv('chat-param-group');
		freqGroup.addClass('chat-param-group');
		freqGroup.createSpan({ text: 'Freq. penalty', cls: 'chat-label' });
		this.frequencyPenaltySlider = freqGroup.createEl('input', { type: 'range' });
		this.frequencyPenaltySlider.min = '-2';
		this.frequencyPenaltySlider.max = '2';
		this.frequencyPenaltySlider.step = '0.1';
		this.frequencyPenaltySlider.value = this.state.frequencyPenalty.toString();
		this.frequencyPenaltySlider.addClass('chat-slider');
		this.frequencyPenaltyValueEl = freqGroup.createSpan({ text: this.state.frequencyPenalty.toFixed(1), cls: 'chat-param-value' });
		this.frequencyPenaltySlider.addEventListener('input', () => {
			const val = parseFloat(this.frequencyPenaltySlider!.value);
			this.state.frequencyPenalty = val;
			this.frequencyPenaltyValueEl!.setText(val.toFixed(1));
		});

		// Presence Penalty
		const presGroup = paramsContainer.createDiv('chat-param-group');
		presGroup.addClass('chat-param-group');
		presGroup.createSpan({ text: 'Pres. penalty', cls: 'chat-label' });
		this.presencePenaltySlider = presGroup.createEl('input', { type: 'range' });
		this.presencePenaltySlider.min = '-2';
		this.presencePenaltySlider.max = '2';
		this.presencePenaltySlider.step = '0.1';
		this.presencePenaltySlider.value = this.state.presencePenalty.toString();
		this.presencePenaltySlider.addClass('chat-slider');
		this.presencePenaltyValueEl = presGroup.createSpan({ text: this.state.presencePenalty.toFixed(1), cls: 'chat-param-value' });
		this.presencePenaltySlider.addEventListener('input', () => {
			const val = parseFloat(this.presencePenaltySlider!.value);
			this.state.presencePenalty = val;
			this.presencePenaltyValueEl!.setText(val.toFixed(1));
		});

		this.agentConfigSummaryEl = row.createDiv('chat-agent-summary');
		this.agentConfigSummaryEl.addClass('chat-agent-summary');
		this.agentConfigSummaryEl.addClass('ia-hidden');
		this.agentSummaryTitleEl = this.agentConfigSummaryEl.createSpan({
			cls: 'chat-agent-summary-title',
			text: 'Agent configuration'
		});
		this.agentSummaryDetailsEl = this.agentConfigSummaryEl.createDiv('chat-agent-summary-details');
		this.agentSummaryDetailsEl.createSpan({
			cls: 'chat-agent-summary-text',
			text: 'Agent controls determine model, temperature, and token limits.'
		});
	}

	private createTokenRow(parent: HTMLElement) {
		const row = parent.createDiv('chat-token-row');
		row.addClass('chat-token-row');
		        this.modelCountEl = row.createSpan({ cls: 'chat-token-chip', text: 'Models: 0' });
		        this.modelCountEl.addClass('ia-model-count');		this.tokenSummaryEl = row.createSpan({ cls: 'chat-token-chip', text: 'Tokens: 0' });
		this.tokenSummaryEl.addClass('ia-token-summary-display');
	}

	private async updateQuickActionsState() {
		if (this.ragActionItem) {
			const enabled = this.plugin.settings.ragConfig.enabled;
			this.updateActionToggleState(
				this.ragActionItem,
				enabled,
				this.state.enableRAG,
				enabled ? (this.state.enableRAG ? 'On' : 'Off') : 'Disabled'
			);
		}

		if (this.webActionItem) {
			const enabled = this.plugin.settings.webSearchConfig.enabled;
			this.updateActionToggleState(
				this.webActionItem,
				enabled,
				this.state.enableWebSearch,
				enabled ? (this.state.enableWebSearch ? 'On' : 'Off') : 'Disabled'
			);
		}

		await this.updateImageButtonVisibility();
	}

	private updateActionToggleState(
		item: HTMLElement,
		enabled: boolean,
		active: boolean,
		statusText: string
	) {
		item.toggleClass('is-disabled', !enabled);
		item.toggleClass('is-active', enabled && active);
		const status = item.querySelector('.header-action-status');
		if (status) {
			status.textContent = statusText;
		}
	}

	private setupHeaderActions(inputHeader: HTMLElement) {
		const actionsContainer = inputHeader.createDiv('chat-header-actions');
		actionsContainer.addClass('chat-header-actions');
		this.headerActionsContainer = actionsContainer;

		const addReferenceBtn = this.createHeaderActionButton(actionsContainer, {
			icon: 'paperclip',
			label: 'Add reference',
			tooltip: 'Add file or folder reference (@)',
			onClick: () => this.showReferenceMenu()
		});
		addReferenceBtn.addClass('is-link');

		this.imageActionItem = this.createHeaderActionButton(actionsContainer, {
			icon: 'image',
			label: 'Add picture',
			tooltip: 'Attach an image to your message',
			showStatus: true,
			onClick: () => {
				if (this.imageActionItem?.hasClass('is-disabled')) {
					new Notice('Image attachment is unavailable for the current model.');
					return;
				}
				void this.attachImage();
			}
		});

		this.ragActionItem = this.createHeaderActionButton(actionsContainer, {
			icon: 'book-open',
			label: 'RAG',
			tooltip: 'Use indexed notes as context',
			showStatus: true,
			onClick: () => { void this.handleQuickActionRag(); }
		});
		this.ragActionItem?.addClass('is-toggle');

		this.webActionItem = this.createHeaderActionButton(actionsContainer, {
			icon: 'search',
			label: 'Web Search',
			tooltip: 'Search the internet when needed',
			showStatus: true,
			onClick: () => { void this.handleQuickActionWeb(); }
		});
		this.webActionItem?.addClass('is-toggle');

		void this.updateQuickActionsState();
		void this.updateRagStatus();
	}

	private createHeaderActionButton(
		container: HTMLElement,
		config: { icon: string; label: string; tooltip?: string; showStatus?: boolean; onClick: () => void }
	): HTMLButtonElement {
		const button = container.createEl('button', { cls: 'header-action-btn' });
		button.type = 'button';
		if (config.tooltip) {
			button.setAttr('title', config.tooltip);
		}
		button.addEventListener('click', (event) => {
			event.preventDefault();
			void config.onClick();
		});

		const iconEl = button.createSpan({ cls: 'header-action-icon' });
		setIcon(iconEl, config.icon);
		button.createSpan({ cls: 'header-action-label', text: config.label });
		if (config.showStatus) {
			button.createSpan({ cls: 'header-action-status' });
		}
		return button;
	}

	private async handleQuickActionRag() {
		if (!this.plugin.settings.ragConfig.enabled) {
			new Notice('RAG is disabled in settings. Enable it under settings → chat features → RAG.');
			return;
		}
		this.state.enableRAG = !this.state.enableRAG;
		await this.updateQuickActionsState();
		await this.updateRagStatus();
	}

	private async handleQuickActionWeb() {
		if (!this.plugin.settings.webSearchConfig.enabled) {
			new Notice('Web search is disabled in settings. Enable it under settings → chat features → web search.');
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
		if (!this.agentSelector) return null;

		const selectEl = this.agentSelector;
		const agents = this.plugin.settings.agents;

		selectEl.empty();

		if (!agents || agents.length === 0) {
			const placeholder = document.createElement('option');
			placeholder.value = '';
			placeholder.textContent = 'No agents configured';
			placeholder.disabled = true;
			placeholder.selected = true;
			selectEl.appendChild(placeholder);
			selectEl.disabled = true;
			return null;
		}

		selectEl.disabled = false;

		const placeholder = document.createElement('option');
		placeholder.value = '';
		placeholder.textContent = 'Select an agent…';
		placeholder.disabled = true;
		selectEl.appendChild(placeholder);

		const validIds = new Set(agents.map(agent => agent.id));
		const currentActive = preferredAgentId && validIds.has(preferredAgentId)
			? preferredAgentId
			: (this.plugin.settings.activeAgentId && validIds.has(this.plugin.settings.activeAgentId)
				? this.plugin.settings.activeAgentId
				: null);

			for (const agent of agents) {
				const option = document.createElement('option');
				option.value = agent.id;
				option.textContent = `${agent.icon || '🤖'} ${agent.name ?? 'unknown'}`;
				selectEl.appendChild(option);
			}

		// Add CLI agents if any exist
		const cliAgents = this.plugin.settings.cliAgents ?? [];
		if (cliAgents.length > 0) {
			const separator = document.createElement('option');
			separator.value = '';
			separator.textContent = '── CLI Agents ──';
			separator.disabled = true;
			selectEl.appendChild(separator);

			for (const cliAgent of cliAgents) {
				const option = document.createElement('option');
				option.value = `cli:${cliAgent.id}`;
				option.textContent = `⚡ ${cliAgent.name}`;
				selectEl.appendChild(option);
			}
		}

		if (currentActive) {
			selectEl.value = currentActive;
			return currentActive;
		}

		// Check if a CLI agent was previously selected
		if (this.selectedCliAgentId) {
			const cliValue = `cli:${this.selectedCliAgentId}`;
			const cliExists = cliAgents.some(a => a.id === this.selectedCliAgentId);
			if (cliExists) {
				selectEl.value = cliValue;
				return null;
			}
		}

		placeholder.selected = true;
		return null;
	}


	private async applyAgentConfig(agentId: string, options?: { silent?: boolean }) {
		const agent = this.plugin.settings.agents.find(a => a.id === agentId);
		if (!agent) return;

		// Apply agent's LLM configuration
		this.state.temperature = agent.temperature;
		this.state.maxTokens = agent.maxTokens;

		// Update UI elements if they exist
		if (this.temperatureSlider) {
			this.temperatureSlider.value = String(agent.temperature);
		}
		if (this.maxTokensInput) {
			this.maxTokensInput.value = String(agent.maxTokens);
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
			new Notice(`Applied configuration for agent: ${agent.icon || '🤖'} ${agent.name ?? 'unknown'}`);
		}
	}

	private agentExecutionTraceEl: HTMLElement | null = null;

	private processToolCalls(content: string, traceContainer?: HTMLElement, _contentEl?: HTMLElement) {
		// Get the active agent if in agent mode
		const activeAgent = this.plugin.settings.activeAgentId
			? this.plugin.settings.agents.find(a => a.id === this.plugin.settings.activeAgentId)
			: undefined;
			
		return processToolCalls(
			content,
			this.state.messages,
			this.state.agentExecutionSteps,
			this.toolManager,
			activeAgent, // Pass agent to check tool permissions
			traceContainer,
			() => Promise.resolve(this.continueAgentConversation(traceContainer, _contentEl)),
			{ allowOpenApiTools: this.plugin.hasEnabledOpenApiTools() }
		);
	}

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
	private continueAgentConversation(traceContainer?: HTMLElement, _contentEl?: HTMLElement): void {
		console.debug('[Agent] Continuing agent conversation after tool execution...');

		// Get the current config and model to make another call
		const selectedModel = this.modelSelect.value;
		if (!selectedModel) {
			console.error('[Agent] No model selected for continuation');
			return;
		}

		// Get config using the same method as the original code
		const config = ModelManager.findConfigForModelByProvider(selectedModel, this.plugin.settings.llmConfigs);

		if (!config) {
			console.error('[Agent] No active config found for continuation');
			return;
		}

		// Don't create a new message element - we'll continue in the trace
		let fullContent = '';

		try {
			// Build the chat request with all current messages (including tool results)
			const chatRequest = {
				model: selectedModel,
				messages: [...this.state.messages], // Use all messages including the tool results we just added
				temperature: this.state.temperature,
				maxTokens: this.state.maxTokens,
				topP: this.state.topP,
				frequencyPenalty: this.state.frequencyPenalty,
				presencePenalty: this.state.presencePenalty
			};

			// Add system prompts and context if needed
			// Add system prompt if configured (use the same method as the original)
			const systemMessages: Message[] = [];
			const systemPromptContent = this.plugin.settings.systemPrompts.find(p => p.id === this.plugin.settings.activeSystemPromptId)?.content;
			if (systemPromptContent) {
				systemMessages.push({
					role: 'system' as const,
					content: systemPromptContent
				});
			}

			// Agent memory is temporarily disabled

			// Add system prompt for Agent mode (this is important to maintain agent behavior)
			if (this.state.mode === 'agent') {
				// Check if this is a generic agent mode (not a specific agent)
				const isGenericAgent = !this.plugin.settings.activeAgentId;
				
				// Only enable ReAct pattern for generic agent mode (not for specific agents)
				if (isGenericAgent) {
					const toolsList = this.toolManager.getAllTools().map(tool =>
						`- ${tool.definition.name}: ${tool.definition.description}`
					).join('\n');

					systemMessages.push({
						role: 'system' as const,
						content: `You are a ReAct (Reasoning + Action) agent. You think step-by-step and take actions when needed to solve user queries.

Follow this ReAct pattern strictly:
Thought: First, think about what you need to do to solve the query
Action: Then, call a tool if needed with the proper arguments
Observation: You will receive the result of your action
Repeat: Continue thinking, acting, and observing until you can provide a final answer

Available tools:
${toolsList}

To call a tool, respond with a JSON block in this format:
\`\`\`json
{
  "name": "tool_name",
  "arguments": {
    "arg1": "value1",
    "arg2": "value2"
  }
}
\`\`\`

Always think before you act. Only call one tool at a time. After receiving the result, think about what to do next.

Example format:
Thought: I need to search for information about Obsidian plugins
Action: 
\`\`\`json
{
  "name": "web_search",
  "arguments": {
    "query": "Obsidian plugins tutorial"
  }
}
\`\`\`
Observation: [Tool result will appear here]
Thought: Based on the search results, I can now answer the user's question...

After calling a tool and receiving results, you can continue the conversation or call another tool if needed.`
					});
				} else {
					// For specific agents (not generic), use standard agent instructions without ReAct pattern
					const activeAgent = this.plugin.settings.agents?.find(a => a.id === this.plugin.settings.activeAgentId);
					const toolsList = this.toolManager.getAllTools().filter(tool => {
						if (!activeAgent) return true;
						if (tool.provider === 'built-in') return true; // already filtered by setToolConfigs
						if (tool.provider?.startsWith('mcp:')) {
							const serverName = tool.provider.substring(4);
							if (activeAgent.enabledMcpServers.includes(serverName)) return true;
							const fullKey = `${serverName}::${tool.definition.name}`;
							return activeAgent.enabledMcpTools?.includes(fullKey) ?? false;
						}
						if (tool.provider?.startsWith('cli:')) {
							if (activeAgent.enabledAllCLITools) return true;
							const toolId = tool.provider.substring(4);
							return activeAgent.enabledCLITools?.includes(toolId) ?? false;
						}
						return true;
					}).map(tool =>
						`- ${tool.definition.name}: ${tool.definition.description}`
					).join('\n');

					systemMessages.push({
						role: 'system' as const,
						content: `You are an AI agent with access to tools. You can call tools to help answer the user's questions.

Available tools:
${toolsList}

To call a tool, respond with a JSON block in this format:
\`\`\`json
{
  "name": "tool_name",
  "arguments": {
    "arg1": "value1",
    "arg2": "value2"
  }
}
\`\`\`

After calling a tool, you will receive the result and can continue the conversation or call another tool if needed.`
					});
				}
			}

			// Deduplicate and apply context window limit to conversation messages
			const agentContextWindow = this.getActiveAgent()?.contextWindow ?? 20;
			const dedupedMessages = deduplicateMessages(chatRequest.messages);
			const truncatedMessages = dedupedMessages.length > agentContextWindow
				? dedupedMessages.slice(-agentContextWindow)
				: dedupedMessages;

			// Insert system messages at the beginning
			const allMessages = [...systemMessages, ...truncatedMessages];
			console.debug('[Agent] continueAgentConversation messages count:', allMessages.length, '(deduped from:', chatRequest.messages.length, ', context window:', agentContextWindow, ')');

			// Make the API call with the updated messages
			// Use streaming like the main implementation
			const provider = ProviderFactory.createProvider(config);
			
			// Add a "Thinking..." indicator while the agent is processing
			const responseStepIndex = this.state.agentExecutionSteps.length;
			this.state.agentExecutionSteps.push({
				type: 'response',
				content: 'Thinking...',
				timestamp: Date.now(),
				status: 'pending'
			});
			if (traceContainer) {
				this.updateExecutionTrace(traceContainer);
			}

			void provider.streamChat(
				{
					...chatRequest,
					messages: allMessages
				},
				(chunk: unknown) => {
					const c = chunk as { content?: string; done?: boolean };
					if (c && typeof c.content === 'string') {
						fullContent += c.content;
					}

					if (c && c.done) {
						// Remove the thinking indicator
						this.state.agentExecutionSteps.splice(responseStepIndex, 1);

						// Add the assistant's response to the messages
						this.state.messages.push({
							role: 'assistant',
							content: fullContent,
							model: selectedModel
						} as Message);

						if (this.state.mode === 'agent' && traceContainer) {
							void (async () => {
								await new Promise(resolve => setTimeout(resolve, 50));
								const toolsExecuted = await this.processToolCalls(fullContent, traceContainer, _contentEl);

								this.updateExecutionTrace(traceContainer);

								if (!toolsExecuted && _contentEl) {
									// Agent is done - display final answer and collapse trace
									this.displayAgentFinalAnswer(_contentEl);
									collapseExecutionTrace(traceContainer);
									const traceRoot = traceContainer.closest('.agent-execution-trace-container');
									if (traceRoot) {
										const countEl = traceRoot.querySelector('.agent-trace-count');
										if (countEl) {
											countEl.textContent = String(this.state.agentExecutionSteps.length) + ' steps';
										}
									}
								}
							})();
						}

						// Save conversation after successful message
						void this.conversationManager.saveCurrentConversation();
					}
				}
			);
		} catch (_error) {
			const errMsg = _error instanceof Error ? _error.message : String(_error);
			console.error('[Agent] Error continuing agent conversation:', errMsg);
			new Notice('Error continuing agent conversation: ' + errMsg);
		}
	}

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
			new Notice('No files found in vault');
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
							new Notice(`Attached: ${file.name ?? 'unknown'}`);
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
					new Notice(`Attached ${selectedFiles.length} image(s)`);
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

	private updateAttachmentPreview() {
		if (!this.attachmentContainer) return;

		this.attachmentContainer.empty();

		if (this.state.currentAttachments.length === 0) {
			this.attachmentContainer.addClass('ia-hidden');
			return;
		}

		this.attachmentContainer.removeClass('ia-hidden');
		this.attachmentContainer.setCssProps({ 'gap': '8px' });
		this.attachmentContainer.setCssProps({ 'padding': '8px' });
		this.attachmentContainer.setCssProps({ 'background': 'var(--background-secondary)' });
		this.attachmentContainer.setCssProps({ 'border-radius': '4px' });
		this.attachmentContainer.setCssProps({ 'flex-wrap': 'wrap' });
		this.attachmentContainer.setCssProps({ 'margin-bottom': '8px' });

		this.state.currentAttachments.forEach((att, index) => {
			const attPreview = this.attachmentContainer!.createDiv('attachment-preview-item');
			attPreview.setCssProps({ 'position': 'relative' });
			attPreview.setCssProps({ 'padding': '8px' });
			attPreview.setCssProps({ 'background': 'var(--background-primary)' });
			attPreview.setCssProps({ 'border-radius': '4px' });
			attPreview.removeClass('ia-hidden');
			attPreview.setCssProps({ 'align-items': 'center' });
			attPreview.setCssProps({ 'gap': '8px' });

			if (att.type === 'image' && att.content) {
				const img = attPreview.createEl('img');
				img.src = att.content;
				img.alt = att.name;
				img.setCssProps({ 'width': '40px' });
				img.setCssProps({ 'height': '40px' });
				img.setCssProps({ 'object-fit': 'cover' });
				img.setCssProps({ 'border-radius': '4px' });
			} else {
				attPreview.createSpan({ text: att.type === 'image' ? '🖼️' : '📎' });
			}

			attPreview.createSpan({ text: att.name });

			// Remove button
			const removeBtn = attPreview.createEl('button', { text: '×' });
			removeBtn.setCssProps({ 'margin-left': 'auto' });
			removeBtn.setCssProps({ 'padding': '0 6px' });
			removeBtn.setCssProps({ 'border': 'none' });
			removeBtn.setCssProps({ 'background': 'transparent' });
			removeBtn.addClass('ia-clickable');
			removeBtn.setCssProps({ 'font-size': '20px' });
			removeBtn.setCssProps({ 'color': 'var(--text-error)' });
			removeBtn.addEventListener('click', () => {
				this.state.currentAttachments.splice(index, 1);
				this.updateAttachmentPreview();
			});
		});
	}

// 	private addStyles() {
// 		const styleEl = document.createElement('style');
// 		styleEl.textContent = `
// 			.intelligence-assistant-chat-container {
// 				display: flex;
// 				flex-direction: column;
// 				height: 100%;
// 				padding: 0;
// 			}
// 
// 			.chat-main-layout {
// 				display: flex;
// 				height: 100%;
// 				gap: 0;
// 				position: relative;
// 			}
// 
// 			.conversation-list-floating {
// 				position: absolute;
// 				left: 0;
// 				top: 0;
// 				bottom: 0;
// 				width: 280px;
// 				background: var(--background-secondary);
// 				border-right: 1px solid var(--background-modifier-border);
// 				box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
// 				z-index: 100;
// 				display: flex;
// 				flex-direction: column;
// 			}
// 
// 			.conversation-list-header {
// 				padding: 10px;
// 				border-bottom: 1px solid var(--background-modifier-border);
// 				display: flex;
// 				justify-content: space-between;
// 				align-items: center;
// 			}
// 
// 			.conversation-list-header h3 {
// 				margin: 0;
// 				font-size: 14px;
// 				font-weight: 600;
// 			}
// 
// 			.conversation-header-buttons {
// 				display: flex;
// 				gap: 4px;
// 			}
// 
// 			.pin-conversation-btn,
// 			.new-conversation-btn {
// 				width: 24px;
// 				height: 24px;
// 				padding: 0;
// 				border-radius: 4px;
// 				border: 1px solid var(--background-modifier-border);
// 				background: var(--background-primary);
// 				color: var(--text-normal);
// 				cursor: pointer;
// 				font-size: 14px;
// 				line-height: 1;
// 			}
// 
// 			.pin-conversation-btn:hover,
// 			.new-conversation-btn:hover {
// 				background: var(--background-modifier-hover);
// 			}
// 
// 			.conversation-list-content {
// 				flex: 1;
// 				overflow-y: auto;
// 			}
// 
// 			.conversation-item {
// 				padding: 10px;
// 				border-bottom: 1px solid var(--background-modifier-border);
// 				cursor: pointer;
// 				transition: background-color 0.1s;
// 			}
// 
// 			.conversation-item:hover {
// 				background: var(--background-modifier-hover);
// 			}
// 
// 			.conversation-item.active {
// 				background: var(--background-modifier-active-hover);
// 			}
// 
// 			.conversation-title {
// 				font-size: 13px;
// 				color: var(--text-normal);
// 				overflow: hidden;
// 				text-overflow: ellipsis;
// 				white-space: nowrap;
// 			}
// 
// 			.empty-state {
// 				padding: 20px;
// 				text-align: center;
// 				color: var(--text-muted);
// 				font-size: 12px;
// 			}
// 
// 			.main-chat-area {
// 				flex: 1;
// 				width: 100%;
// 				display: flex;
// 				flex-direction: column;
// 				padding: 10px;
// 			}
// 
// 			.chat-header {
// 				display: flex;
// 				align-items: center;
// 				gap: 10px;
// 				padding: 10px 0;
// 				border-bottom: 1px solid var(--background-modifier-border);
// 				margin-bottom: 10px;
// 				flex-wrap: wrap;
// 			}
// 
// 			.model-selector {
// 				display: flex;
// 				align-items: center;
// 				gap: 8px;
// 				flex: 1;
// 			}
// 
// 			.model-selector select {
// 				flex: 1;
// 				min-width: 150px;
// 				padding: 6px 10px;
// 				border-radius: 4px;
// 				border: 1px solid var(--background-modifier-border);
// 				background: var(--background-primary);
// 				color: var(--text-normal);
// 				font-weight: 500;
// 			}
// 
// 			.provider-selector {
// 				display: flex;
// 				align-items: center;
// 				gap: 8px;
// 			}
// 
// 			.provider-selector span {
// 				font-size: 12px;
// 				color: var(--text-muted);
// 			}
// 
// 			.provider-selector select {
// 				padding: 4px 8px;
// 				border-radius: 4px;
// 				border: 1px solid var(--background-modifier-border);
// 				background: var(--background-primary);
// 				color: var(--text-normal);
// 				font-size: 12px;
// 			}
// 
// 			.params-row {
// 				display: flex;
// 				gap: 20px;
// 				padding: 10px 0;
// 				border-bottom: 1px solid var(--background-modifier-border);
// 				margin-bottom: 10px;
// 			}
// 
// 			.param-control {
// 				display: flex;
// 				align-items: center;
// 				gap: 8px;
// 			}
// 
// 			.param-label {
// 				font-size: 12px;
// 				color: var(--text-muted);
// 				white-space: nowrap;
// 			}
// 
// 			.param-value {
// 				font-size: 12px;
// 				color: var(--text-normal);
// 				min-width: 30px;
// 				text-align: center;
// 			}
// 
// 			.param-control input[type="range"] {
// 				width: 120px;
// 			}
// 
// 			.param-control input[type="number"] {
// 				width: 100px;
// 				padding: 4px 8px;
// 				border-radius: 4px;
// 				border: 1px solid var(--background-modifier-border);
// 				background: var(--background-primary);
// 				color: var(--text-normal);
// 				font-size: 12px;
// 			}
// 
// 			.chat-messages {
// 				flex: 1;
// 				overflow-y: auto;
// 				padding: 12px 16px;
// 				display: flex;
// 				flex-direction: column;
// 				gap: 12px;
// 			}
// 
// 			.chat-message {
// 				display: flex;
// 				width: 100%;
// 			}
// 
// 			.message-user .message-row {
// 				flex-direction: row-reverse;
// 			}
// 
// 			.message-row {
// 				display: flex;
// 				gap: 10px;
// 				width: 100%;
// 				max-width: 100%;
// 			}
// 
// 			.message-avatar {
// 				flex-shrink: 0;
// 				width: 28px;
// 				height: 28px;
// 				border-radius: 50%;
// 				background: var(--background-modifier-border);
// 				display: flex;
// 				align-items: center;
// 				justify-content: center;
// 				color: var(--text-muted);
// 			}
// 
// 			.message-avatar svg {
// 				width: 16px;
// 				height: 16px;
// 			}
// 
// 			.message-user .message-avatar {
// 				background: var(--interactive-accent);
// 				color: white;
// 			}
// 
// 			.message-assistant .message-avatar {
// 				background: var(--background-secondary);
// 				border: 1px solid var(--background-modifier-border);
// 			}
// 
// 			/* tool execution messages */
// 			.message-tool {
// 				padding: 12px;
// 				margin: 12px 0;
// 				background: var(--background-primary);
// 				border: 1px solid var(--background-modifier-border);
// 				border-radius: 6px;
// 			}
// 
// 			.tool-execution {
// 				display: flex;
// 				flex-direction: column;
// 				gap: 8px;
// 			}
// 
// 			.tool-icon {
// 				font-size: 20px;
// 			}
// 
// 			.tool-name {
// 				font-weight: 600;
// 				color: var(--text-accent);
// 				font-size: 13px;
// 			}
// 
// 			.tool-args {
// 				font-family: var(--font-monospace);
// 				font-size: 11px;
// 				color: var(--text-muted);
// 				white-space: pre;
// 				background: var(--background-secondary);
// 				padding: 8px;
// 				border-radius: 4px;
// 			}
// 
// 			.tool-result {
// 				margin-top: 8px;
// 				padding: 8px;
// 				border-radius: 4px;
// 			}
// 
// 			.tool-success {
// 				background: rgba(0, 255, 0, 0.1);
// 				border-left: 3px solid var(--text-success);
// 			}
// 
// 			.tool-error {
// 				background: rgba(255, 0, 0, 0.1);
// 				border-left: 3px solid var(--text-error);
// 			}
// 
// 			.tool-result pre {
// 				font-family: var(--font-monospace);
// 				font-size: 11px;
// 				margin: 4px 0 0 0;
// 				white-space: pre-wrap;
// 			}
// 
// 			.message-body {
// 				flex: 1;
// 				min-width: 0;
// 			}
// 
// 			.message-body,
// 			.ia-chat-message__body,
// 			.message-content,
// 			.ia-chat-message__content {
// 				user-select: text;
// 			}
// 
// 			.message-actions,
// 			.message-actions *,
// 			.ia-chat-message__actions,
// 			.ia-chat-message__actions * {
// 				user-select: none;
// 			}
// 
// 			.message-meta {
// 				display: flex;
// 				align-items: center;
// 				gap: 6px;
// 				flex-wrap: wrap;
// 				margin-bottom: 4px;
// 			}
// 
// 			.message-name {
// 				font-weight: 600;
// 				font-size: 12px;
// 				color: var(--text-normal);
// 			}
// 
// 			.ia-chat-message__badges {
// 				display: flex;
// 				flex-wrap: wrap;
// 				gap: 4px;
// 			}
// 
// 			.ia-chat-message__badge {
// 				display: inline-flex;
// 				align-items: center;
// 				gap: 4px;
// 				padding: 2px 8px;
// 				border-radius: 999px;
// 				border: 1px solid var(--background-modifier-border);
// 				background: var(--background-primary);
// 				font-size: 10px;
// 				color: var(--text-muted);
// 			}
// 
// 			.ia-chat-message__badge-label {
// 				font-weight: 600;
// 				text-transform: uppercase;
// 				letter-spacing: 0.02em;
// 			}
// 
// 			.ia-chat-message__badge-value {
// 				color: var(--text-normal);
// 			}
// 
// 			.message-timestamp {
// 				font-size: 10px;
// 				color: var(--text-faint);
// 			}
// 
// 			.message-actions {
// 				display: flex;
// 				gap: 2px;
// 				margin-top: 4px;
// 				opacity: 0;
// 				transition: opacity 0.15s;
// 			}
// 
// 			.message-body:hover .message-actions {
// 				opacity: 1;
// 			}
// 
// 			.msg-action-btn {
// 				padding: 3px 6px;
// 				border: none;
// 				background: transparent;
// 				color: var(--text-muted);
// 				cursor: pointer;
// 				border-radius: 3px;
// 				display: flex;
// 				align-items: center;
// 				gap: 2px;
// 				font-size: 11px;
// 				transition: all 0.15s;
// 			}
// 
// 			.msg-action-btn:hover {
// 				background: var(--background-modifier-hover);
// 				color: var(--text-normal);
// 			}
// 
// 			.msg-action-btn svg {
// 				width: 14px;
// 				height: 14px;
// 			}
// 
// 			.message-content {
// 				line-height: 1.5;
// 				word-wrap: break-word;
// 				font-size: 13px;
// 				white-space: normal;
// 			}
// 
// 			.message-content p {
// 				margin: 0.2em 0;
// 			}
// 
// 			.message-content p:first-child {
// 				margin-top: 0;
// 			}
// 
// 			.message-content p:last-child {
// 				margin-bottom: 0;
// 			}
// 
// 			.message-content p:empty {
// 				display: none;
// 			}
// 
// 			.message-content code {
// 				background: var(--background-primary);
// 				padding: 2px 6px;
// 				border-radius: 4px;
// 				font-family: var(--font-monospace);
// 				font-size: 0.9em;
// 			}
// 
// 			.message-content pre {
// 				background: var(--background-primary);
// 				padding: 12px;
// 				border-radius: 6px;
// 				overflow-x: auto;
// 				margin: 8px 0;
// 			}
// 
// 			.message-content pre code {
// 				background: none;
// 				padding: 0;
// 			}
// 
// 			.message-content ul, .message-content ol {
// 				margin: 0.5em 0;
// 				padding-left: 1.5em;
// 			}
// 
// 			.message-content blockquote {
// 				border-left: 3px solid var(--background-modifier-border);
// 				padding-left: 12px;
// 				margin: 8px 0;
// 				opacity: 0.8;
// 			}
// 
// 			.message-attachments {
// 				margin-top: 6px;
// 				display: flex;
// 				flex-direction: column;
// 				gap: 4px;
// 			}
// 
// 			.attachment-item {
// 				padding: 6px;
// 				background: var(--background-modifier-border);
// 				border-radius: 4px;
// 				font-size: 0.85em;
// 			}
// 
// 			.chat-input-container {
// 				margin-top: 12px;
// 				padding: 12px;
// 				background: var(--background-secondary);
// 				border: 1px solid var(--background-modifier-border);
// 				border-radius: 10px;
// 				display: flex;
// 				flex-direction: column;
// 				gap: 10px;
// 			}
// 
// 			.chat-input-header {
// 				display: flex;
// 				align-items: center;
// 				gap: 10px;
// 				flex-wrap: wrap;
// 			}
// 
// 			.chat-top-controls,
// 			.chat-action-row,
// 			.chat-model-row,
// 			.chat-token-row {
// 				display: flex;
// 				align-items: center;
// 				gap: 10px;
// 				flex-wrap: wrap;
// 				margin-bottom: 8px;
// 			}
// 
// 			.chat-action-row {
// 				display: flex;
// 				justify-content: space-between;
// 				align-items: center;
// 				gap: 12px;
// 				margin: 6px 0 12px 0;
// 			}
// 
// 			.chat-breadcrumb {
// 				display: flex;
// 				align-items: center;
// 				gap: 6px;
// 				font-size: 12px;
// 				color: var(--text-muted);
// 			}
// 
// 			.chat-breadcrumb-link {
// 				color: var(--text-accent);
// 				font-weight: 600;
// 				cursor: pointer;
// 				background: transparent;
// 				border: none;
// 				padding: 0;
// 			}
// 
// 			.chat-breadcrumb-link:hover {
// 				text-decoration: underline;
// 			}
// 
// 			.chat-breadcrumb-current {
// 				font-weight: 600;
// 				color: var(--text-normal);
// 			}
// 
// 			.chat-action-buttons {
// 				display: flex;
// 				align-items: center;
// 				gap: 8px;
// 			}
// 
// 			.chat-action-link {
// 				color: var(--text-dark);
// 				font-weight: 600;
// 				cursor: pointer;
// 			}
// 
// 			.chat-action-link:hover {
// 				color: var(--text-accent);
// 				text-decoration: underline;
// 			}
// 
// 			.chat-action-sep {
// 				color: var(--text-muted);
// 				font-size: 12px;
// 			}
// 
// 			.chat-model-row {
// 				display: flex;
// 				flex-direction: column;
// 				gap: 8px;
// 				padding: 10px;
// 				border: 1px solid var(--background-modifier-border);
// 				border-radius: 10px;
// 				background: var(--background-secondary);
// 			}
// 
// 			.chat-model-controls {
// 				display: flex;
// 				flex-wrap: wrap;
// 				gap: 12px;
// 				align-items: center;
// 			}
// 
// 			.chat-model-select {
// 				display: flex;
// 				flex: 1;
// 				align-items: center;
// 				gap: 8px;
// 			}
// 
// 			.chat-model-select .chat-label {
// 				font-weight: 600;
// 			}
// 
// 			.model-select {
// 				flex: 1;
// 				min-width: 160px;
// 				padding: 6px 10px;
// 				border-radius: 8px;
// 				border: 1px solid var(--background-modifier-border);
// 				background: var(--background-primary);
// 			}
// 
// 			.chat-param-group {
// 				display: flex;
// 				align-items: center;
// 				gap: 8px;
// 			}
// 
// 			.chat-agent-summary {
// 				display: none;
// 				flex-direction: column;
// 				gap: 6px;
// 				padding-top: 6px;
// 				border-top: 1px solid var(--background-modifier-border);
// 			}
// 
// 			.chat-agent-summary-title {
// 				font-size: 12px;
// 				font-weight: 600;
// 				color: var(--text-muted);
// 			}
// 
// 			.chat-agent-summary-details {
// 				display: flex;
// 				flex-wrap: wrap;
// 				gap: 6px;
// 				align-items: center;
// 			}
// 
// 			.chat-agent-summary-text {
// 				font-size: 12px;
// 				color: var(--text-muted);
// 			}
// 
// 			.chat-agent-chip {
// 				display: inline-flex;
// 				align-items: center;
// 				gap: 4px;
// 				padding: 4px 10px;
// 				border-radius: 999px;
// 				border: 1px dashed var(--background-modifier-border);
// 				background: var(--background-primary);
// 				font-size: 12px;
// 				color: var(--text-muted);
// 			}
// 
// 			.chat-agent-chip-label {
// 				font-weight: 600;
// 				color: var(--text-muted);
// 			}
// 
// 			.chat-agent-chip-value {
// 				color: var(--text-normal);
// 			}
// 
// 			.chat-label {
// 				font-size: 12px;
// 				color: var(--text-muted);
// 				font-weight: 600;
// 			}
// 
// 			.chat-slider {
// 				width: 120px;
// 			}
// 
// 			.chat-param-value {
// 				font-weight: 600;
// 				color: var(--text-accent);
// 			}
// 
// 			.chat-number-input {
// 				width: 90px;
// 				padding: 4px 8px;
// 				border-radius: 6px;
// 				border: 1px solid var(--background-modifier-border);
// 				background: var(--background-primary);
// 			}
// 
// 			.chat-token-row {
// 				justify-content: space-between;
// 			}
// 
// 			.chat-token-chip {
// 				font-size: 11px;
// 				color: var(--text-muted);
// 				padding: 4px 10px;
// 				border-radius: 999px;
// 				border: 1px solid var(--background-modifier-border);
// 				background: var(--background-primary);
// 			}
// 
// 			.chat-select-group {
// 				display: flex;
// 				align-items: center;
// 				gap: 6px;
// 			}
// 
// 			.chat-header-actions {
// 				display: flex;
// 				align-items: center;
// 				gap: 6px;
// 				flex-wrap: wrap;
// 				margin-left: auto;
// 			}
// 
// 			.header-action-btn {
// 				display: inline-flex;
// 				align-items: center;
// 				gap: 4px;
// 				padding: 4px 10px;
// 				border: 1px solid transparent;
// 				border-radius: 999px;
// 				background: var(--background-primary);
// 				font-size: 12px;
// 				color: var(--text-muted);
// 				cursor: pointer;
// 				transition: background 0.2s ease, color 0.2s ease, border 0.2s ease;
// 			}
// 
// 			.header-action-btn:hover:not(.is-disabled) {
// 				background: var(--background-modifier-hover);
// 				color: var(--text-normal);
// 			}
// 
// 			.header-action-btn.is-active {
// 				border-color: var(--text-accent);
// 				color: var(--text-normal);
// 			}
// 
// 			.header-action-btn.is-disabled {
// 				opacity: 0.5;
// 				cursor: not-allowed;
// 			}
// 
// 			.header-action-btn.is-link {
// 				border-style: dashed;
// 				background: transparent;
// 				color: var(--text-normal);
// 			}
// 
// 			.header-action-icon {
// 				font-size: 12px;
// 				line-height: 1;
// 			}
// 
// 			.header-action-status {
// 				font-size: 11px;
// 				color: var(--text-muted);
// 			}
// 
// 			.chat-input-editor {
// 				border: 1px solid var(--background-modifier-border);
// 				border-radius: 8px;
// 				background: var(--background-primary);
// 				padding: 4px;
// 			}
// 
// 			.chat-input-footer {
// 				padding-top: 4px;
// 			}
// 
// 			/* bottom controls - 3 sections layout */
// 			.input-bottom-controls {
// 				display: flex;
// 				align-items: center;
// 				justify-content: space-between;
// 				gap: 10px;
// 				flex-wrap: wrap;
// 			}
// 
// 			.bottom-left-controls {
// 				display: flex;
// 				align-items: center;
// 				gap: 6px;
// 				flex: 1;
// 				flex-wrap: wrap;
// 			}
// 
// 			.bottom-middle-controls {
// 				display: flex;
// 				align-items: center;
// 				gap: 8px;
// 				flex: 1;
// 				flex-wrap: wrap;
// 			}
// 
// 			.attachment-preview {
// 				display: flex;
// 				flex-wrap: wrap;
// 				gap: 6px;
// 				align-items: center;
// 			}
// 
// 			.bottom-right-controls {
// 				display: flex;
// 				align-items: center;
// 				gap: 8px;
// 				margin-left: auto;
// 			}
// 
// 			.mode-selector,
// 			.prompt-selector,
// 			.agent-selector {
// 				padding: 5px 10px;
// 				border: 1px solid var(--background-modifier-border);
// 				border-radius: 999px;
// 				background: var(--background-primary);
// 				color: var(--text-normal);
// 				font-size: 11px;
// 				cursor: pointer;
// 				min-width: 100px;
// 				transition: border-color 0.2s ease;
// 			}
// 
// 			.mode-selector:focus,
// 			.prompt-selector:focus,
// 			.agent-selector:focus {
// 				outline: none;
// 				border-color: var(--interactive-accent);
// 				box-shadow: 0 0 0 2px rgba(47, 194, 153, 0.15);
// 			}
// 
// 
// 
// 			.checkbox-container {
// 				display: flex;
// 				align-items: center;
// 				gap: 4px;
// 			}
// 
// 			.checkbox-container input[type="checkbox"] {
// 				cursor: pointer;
// 				margin: 0;
// 			}
// 
// 			.checkbox-container label {
// 				font-size: 11px;
// 				color: var(--text-muted);
// 				user-select: none;
// 				cursor: pointer;
// 			}
// 
// 			/* toggle button styles */
// 			.toggle-btn {
// 				display: flex;
// 				align-items: center;
// 				gap: 4px;
// 				padding: 4px 10px;
// 				border-radius: 12px;
// 				border: 1px solid var(--background-modifier-border);
// 				background: var(--background-primary);
// 				color: var(--text-muted);
// 				cursor: pointer;
// 				font-size: 11px;
// 				transition: all 0.2s ease;
// 				outline: none;
// 			}
// 
// 			.toggle-btn:hover {
// 				background: var(--background-modifier-hover);
// 				border-color: var(--interactive-accent);
// 			}
// 
// 			.toggle-btn.active {
// 				background: var(--interactive-accent);
// 				color: white;
// 				border-color: var(--interactive-accent);
// 				box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
// 			}
// 
// 			.toggle-btn .toggle-icon {
// 				font-size: 14px;
// 				line-height: 1;
// 			}
// 
// 			.toggle-btn.active .toggle-icon {
// 				filter: brightness(1.1);
// 			}
// 
// 			.toggle-btn .toggle-label {
// 				font-weight: 500;
// 			}
// 
// 			.tools-label {
// 				font-size: 11px;
// 				color: var(--text-muted);
// 			}
// 
// 			/* workflow execution styles */
// 			.message-workflow {
// 				padding: 12px;
// 				background: var(--background-secondary);
// 				border-left: 4px solid var(--interactive-accent);
// 				border-radius: 4px;
// 				margin-bottom: 12px;
// 			}
// 
// 			.workflow-execution {
// 				font-size: 13px;
// 			}
// 
// 			.workflow-header {
// 				display: flex;
// 				align-items: center;
// 				gap: 8px;
// 				margin-bottom: 12px;
// 				font-weight: 600;
// 			}
// 
// 			.workflow-icon {
// 				font-size: 20px;
// 			}
// 
// 			.workflow-status {
// 				padding: 6px 12px;
// 				background: var(--background-primary);
// 				border-radius: 4px;
// 				font-size: 12px;
// 				margin-bottom: 12px;
// 			}
// 
// 			.workflow-log {
// 				max-height: 400px;
// 				overflow-y: auto;
// 			}
// 
// 			.log-entry {
// 				font-size: 11px;
// 				padding: 4px 0;
// 				border-bottom: 1px solid var(--background-modifier-border);
// 			}
// 
// 			.log-action {
// 				color: var(--text-normal);
// 			}
// 
// 			.log-output {
// 				color: var(--text-muted);
// 				margin-left: 16px;
// 				font-family: monospace;
// 				font-size: 10px;
// 			}
// 
// 			.log-error {
// 				color: var(--text-error);
// 				margin-left: 16px;
// 			}
// 
// 			/* part 1: reference area */
// 			.input-reference-area {
// 				flex: 1;
// 				display: flex;
// 				flex-wrap: wrap;
// 				gap: 4px;
// 				min-height: 28px;
// 				padding: 4px 6px;
// 				background: var(--background-primary);
// 				border: 1px dashed var(--background-modifier-border);
// 				border-radius: 8px;
// 				transition: border-color 0.2s ease;
// 			}
// 
// 			.input-reference-area:empty {
// 				border-style: dashed;
// 			}
// 
// 			.reference-list {
// 				display: flex;
// 				flex-direction: column;
// 				gap: 4px;
// 			}
// 
// 			.reference-item {
// 				display: flex;
// 				align-items: center;
// 				gap: 6px;
// 				padding: 4px 8px;
// 				background: var(--background-secondary);
// 				border-radius: 4px;
// 				font-size: 12px;
// 			}
// 
// 			.reference-icon {
// 				flex-shrink: 0;
// 			}
// 
// 			.reference-path {
// 				flex: 1;
// 				overflow: hidden;
// 				text-overflow: ellipsis;
// 				white-space: nowrap;
// 			}
// 
// 			.reference-remove-btn {
// 				padding: 0 4px;
// 				border: none;
// 				background: transparent;
// 				color: var(--text-error);
// 				cursor: pointer;
// 				font-size: 16px;
// 				line-height: 1;
// 			}
// 
// 			.reference-remove-btn:hover {
// 				background: var(--background-modifier-hover);
// 				border-radius: 2px;
// 			}
// 
// 
// 			/* message references (displayed in sent messages) */
// 			.message-references {
// 				display: flex;
// 				flex-wrap: wrap;
// 				gap: 6px;
// 				margin-top: 8px;
// 			}
// 
// 			.reference-badge {
// 				display: inline-flex;
// 				align-items: center;
// 				gap: 4px;
// 				padding: 3px 8px;
// 				background: var(--background-primary);
// 				border: 1px solid var(--background-modifier-border);
// 				border-radius: 12px;
// 				font-size: 11px;
// 				color: var(--text-muted);
// 				transition: all 0.2s;
// 			}
// 
// 			.reference-badge:hover {
// 				background: var(--background-modifier-hover);
// 				color: var(--text-normal);
// 				border-color: var(--interactive-accent);
// 			}
// 
// 			/* part 2: text input */
// 			.chat-input {
// 				width: 100%;
// 				min-height: 72px;
// 				max-height: 160px;
// 				padding: 14px 16px;
// 				border: 1px solid transparent;
// 				border-radius: 12px;
// 				background: var(--background-primary);
// 				color: var(--text-normal);
// 				resize: none;
// 				font-family: inherit;
// 				font-size: 13px;
// 				line-height: 1.6;
// 				outline: none;
// 				transition: border-color 0.2s, box-shadow 0.2s;
// 			}
// 
// 			.chat-input:focus {
// 				border-color: var(--interactive-accent);
// 				box-shadow: 0 0 0 3px rgba(47, 194, 153, 0.15);
// 			}
// 
// 			.chat-input::placeholder {
// 				color: var(--text-muted);
// 			}
// 
// 
// 
// 			@media (max-width: 720px) {
// 				.chat-input-container {
// 					padding: 12px;
// 				}
// 				.chat-input-footer {
// 					padding-top: 8px;
// 				}
// 				.input-bottom-controls {
// 					flex-direction: column;
// 					align-items: stretch;
// 				}
// 				.bottom-right-controls {
// 					margin-left: 0;
// 					justify-content: flex-start;
// 				}
// 			}
// 
// 			.attachment-preview {
// 				flex: 1;
// 				display: flex;
// 				gap: 6px;
// 				flex-wrap: wrap;
// 			}
// 
// 			.attachment-preview-item {
// 				display: flex;
// 				align-items: center;
// 				gap: 6px;
// 				padding: 4px 8px;
// 				background: var(--background-secondary);
// 				border: 1px solid var(--background-modifier-border);
// 				border-radius: 4px;
// 				font-size: 11px;
// 			}
// 
// 			.send-info {
// 				font-size: 11px;
// 				color: var(--text-muted);
// 			}
// 
// 			.send-info kbd {
// 				padding: 2px 6px;
// 				background: var(--background-primary);
// 				border: 1px solid var(--background-modifier-border);
// 				border-radius: 3px;
// 				font-family: var(--font-monospace);
// 				font-size: 10px;
// 
// 	/* rag sources display */
// 	.rag-sources-container {
// 		margin-top: 12px;
// 		padding: 12px;
// 		background: var(--background-primary);
// 		border: 1px solid var(--background-modifier-border);
// 		border-radius: 6px;
// 	}
// 
// 	.rag-sources-header {
// 		font-weight: 600;
// 		color: var(--text-accent);
// 		margin-bottom: 8px;
// 		font-size: 12px;
// 		display: flex;
// 		align-items: center;
// 		gap: 6px;
// 	}
// 
// 	.rag-sources-grid {
// 		display: flex;
// 		flex-direction: column;
// 		gap: 8px;
// 	}
// 
// 	.rag-source-card {
// 		padding: 10px;
// 		border: 1px solid var(--background-modifier-border);
// 		border-radius: 6px;
// 		background: var(--background-secondary);
// 		transition: all 0.2s ease;
// 		cursor: pointer;
// 	}
// 
// 	.rag-source-card:hover {
// 		border-color: var(--interactive-accent);
// 		background: var(--background-modifier-hover);
// 		transform: translatey(-1px);
// 		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
// 	}
// 
// 	.rag-source-header {
// 		display: flex;
// 		justify-content: space-between;
// 		align-items: flex-start;
// 		margin-bottom: 6px;
// 	}
// 
// 	.rag-source-title {
// 		font-weight: 600;
// 		font-size: 13px;
// 		color: var(--text-normal);
// 		flex: 1;
// 	}
// 
// 	.rag-source-similarity {
// 		font-size: 11px;
// 		font-weight: 600;
// 		background: var(--background-primary);
// 		padding: 2px 6px;
// 		border-radius: 10px;
// 		min-width: 40px;
// 		text-align: center;
// 	}
// 
// 	.rag-source-path {
// 		font-size: 11px;
// 		color: var(--text-muted);
// 		margin-bottom: 6px;
// 		word-break: break-all;
// 	}
// 
// 	.rag-source-content {
// 		font-size: 12px;
// 		color: var(--text-muted);
// 		line-height: 1.4;
// 		background: var(--background-primary);
// 		padding: 8px;
// 		border-radius: 4px;
// 		border-left: 2px solid var(--interactive-accent);
// 	}
// 
// 	.rag-source-content:hover {
// 		background: var(--background-secondary);
// 	}
// 			}
// 		`;
// 		document.head.appendChild(styleEl);
// 	}

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
	
// ---------------------------------------------------------------------------
// Agent chain helpers – used by ChatView.renderMessageList to reconstruct
// historical agent tool-call chains from saved messages.
// ---------------------------------------------------------------------------

/** Returns true if the message content contains a JSON tool-call block. */
function hasAgentToolCall(content: string): boolean {
	const regex = /```json\s*\n([\s\S]*?)\n```/g;
	let match;
	while ((match = regex.exec(content)) !== null) {
		try {
			const json = JSON.parse(match[1]) as Record<string, unknown>;
			const name = json.name ?? json.tool;
			if (name && typeof name === 'string') {
				return true;
			}
		} catch { /* not a tool-call block */ }
	}
	return false;
}

/**
 * Reconstruct AgentExecutionStep[] from a sequence of assistant + system
 * messages that contained tool calls and their results.
 * System messages with format "Tool <name> result: <result>" become
 * observation steps paired with the preceding action.
 */
function reconstructAgentSteps(messages: Message[]): AgentExecutionStep[] {
	const steps: AgentExecutionStep[] = [];
	for (const msg of messages) {
		// System messages contain tool results
		if (msg.role === 'system' && msg.content.startsWith('Tool ')) {
			const resultMatch = msg.content.match(/^Tool\s+\S+\s+result:\s*([\s\S]*)$/);
			const resultContent = resultMatch ? resultMatch[1] : msg.content;
			const isError = resultContent.startsWith('Error:') || resultContent.startsWith('Unknown error');
			steps.push({
				type: 'observation',
				content: resultContent,
				timestamp: Date.now(),
				status: isError ? 'error' : 'success'
			});
			continue;
		}

		// Extract Thought: text (everything between "Thought:" and the next
		// "Action:" / code-fence / or end of string)
		const thoughtMatch = msg.content.match(/Thought:(.*?)(?:Action:|```|$)/s);
		if (thoughtMatch && thoughtMatch[1].trim()) {
			steps.push({
				type: 'thought',
				content: thoughtMatch[1].trim(),
				timestamp: Date.now()
			});
		}

		// Extract every tool-call JSON block
		const regex = /```json\s*\n([\s\S]*?)\n```/g;
		let match;
		while ((match = regex.exec(msg.content)) !== null) {
			try {
				const json = JSON.parse(match[1]) as Record<string, unknown>;
				const name = (json.name ?? json.tool) as string | undefined;
				if (name && typeof name === 'string') {
					const args = typeof json.arguments === 'object' && json.arguments !== null
						? json.arguments as Record<string, unknown>
						: {};
					steps.push({
						type: 'action',
						content: `${name}(${JSON.stringify(args)})`,
						timestamp: Date.now(),
						status: 'success'
					});
				}
			} catch { /* ignore malformed blocks */ }
		}
	}
	return steps;
}

/**
 * Remove consecutive duplicate messages (same role + content).
 * This prevents bloated payloads when an agent repeatedly calls the same tool.
 */
function deduplicateMessages(messages: Message[]): Message[] {
	if (messages.length <= 1) return messages;
	const result: Message[] = [messages[0]];
	for (let i = 1; i < messages.length; i++) {
		const prev = messages[i - 1];
		const cur = messages[i];
		if (cur.role === prev.role && cur.content === prev.content) {
			continue; // skip duplicate
		}
		result.push(cur);
	}
	return result;
}

/**
 * Strip tool-call blocks and ReAct scaffolding text from a message so only
 * the model's plain-language content remains (used as the "final answer"
 * when the last message in a chain also contained tool calls).
 */
function extractFinalContent(message: Message): string {
	let content = message.content;
	// Remove ```json … ``` blocks
	content = content.replace(/```json\s*\n[\s\S]*?\n```/g, '');
	// Remove Thought: … lines
	content = content.replace(/Thought:.*?(?=Action:|```|$)/gs, '');
	// Remove bare "Action:" labels
	content = content.replace(/Action:\s*/g, '');
	return content.trim();
}

// Modal for text input
class TextInputModal extends Modal {
	result: string;
	onSubmit: (result: string) => void;
	placeholder: string;
	defaultValue: string;
	title: string;

	constructor(app: App, title: string, placeholder: string, defaultValue: string, onSubmit: (result: string) => void) {
		super(app);
		this.title = title;
		this.placeholder = placeholder;
		this.defaultValue = defaultValue;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.createEl('h2', { text: this.title });

		new Setting(contentEl)
			.setName('Name')
			.addText(text => {
				text.setPlaceholder(this.placeholder)
					.setValue(this.defaultValue)
					.onChange(value => {
						this.result = value;
					});
				text.inputEl.focus();
				text.inputEl.select();
				// Submit on Enter
				text.inputEl.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						this.close();
						this.onSubmit(this.result || this.defaultValue);
					}
				});
			});

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Create')
				.setCta()
				.onClick(() => {
					this.close();
					this.onSubmit(this.result || this.defaultValue);
				}))
			.addButton(btn => btn
				.setButtonText('Cancel')
				.onClick(() => {
					this.close();
				}));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SearchableReferenceModal extends Modal {
	private onChooseItems: (items: (TFile | TFolder)[]) => void;
	private searchInput: HTMLInputElement;
	private resultsContainer: HTMLElement;
	private allItems: (TFile | TFolder)[];
	private selectedItems: (TFile | TFolder)[] = [];

	constructor(app: App, onChooseItems: (items: (TFile | TFolder)[]) => void) {
		super(app);
		this.onChooseItems = onChooseItems;
		
		// Get all files and folders
		const allFiles = app.vault.getAllLoadedFiles();
		this.allItems = allFiles.filter(f => f instanceof TFile || f instanceof TFolder);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('searchable-reference-modal');

		contentEl.createEl('h2', { text: 'Add references' });

		// Search input
		this.searchInput = contentEl.createEl('input', {
			type: 'text',
			placeholder: 'Search files and folders...'
		});
		this.searchInput.setCssProps({ 'width': '100%' });
		this.searchInput.setCssProps({ 'padding': '8px' });
		this.searchInput.setCssProps({ 'margin-bottom': '10px' });
		this.searchInput.setCssProps({ 'border': '1px solid var(--background-modifier-border)' });
		this.searchInput.setCssProps({ 'border-radius': '4px' });

		// Results container
		this.resultsContainer = contentEl.createDiv();
		this.resultsContainer.setCssProps({ 'max-height': '400px' });
		this.resultsContainer.setCssProps({ 'overflow-y': 'auto' });

		// Initial display of all items
		this.displayItems(this.allItems);

		// Add search event listener
		this.searchInput.addEventListener('input', (e) => {
			const query = (e.target as HTMLInputElement).value.toLowerCase();
			const filteredItems = this.allItems.filter(item => 
				item.path.toLowerCase().includes(query)
			);
			this.displayItems(filteredItems);
		});

		// Add Enter key support for the search input
		this.searchInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && this.selectedItems.length > 0) {
				this.close();
				this.onChooseItems(this.selectedItems);
			}
		});

		// Add button container with actions
		const buttonContainer = contentEl.createDiv();
		buttonContainer.removeClass('ia-hidden');
		buttonContainer.setCssProps({ 'justify-content': 'space-between' });
		buttonContainer.setCssProps({ 'margin-top': '10px' });
		
		const selectAllButton = buttonContainer.createEl('button', { text: 'Select all' });
		selectAllButton.addEventListener('click', () => {
			this.selectedItems = [...this.allItems];
			this.updateDisplay();
		});
		
		const selectNoneButton = buttonContainer.createEl('button', { text: 'Select none' });
		selectNoneButton.addEventListener('click', () => {
			this.selectedItems = [];
			this.updateDisplay();
		});
		
		const addButton = buttonContainer.createEl('button', { text: 'Add selected' });
		addButton.addClass('mod-cta');
		addButton.addEventListener('click', () => {
			this.close();
			this.onChooseItems(this.selectedItems);
		});
	}

	private displayItems(items: (TFile | TFolder)[]) {
		this.resultsContainer.empty();
		
		if (items.length === 0) {
			this.resultsContainer.createDiv({ text: 'No matching files or folders found.' });
			return;
		}

		items.forEach(item => {
			const itemEl = this.resultsContainer.createDiv('reference-item');
			itemEl.removeClass('ia-hidden');
			itemEl.setCssProps({ 'align-items': 'center' });
			itemEl.setCssProps({ 'padding': '6px' });
			itemEl.setCssProps({ 'border-bottom': '1px solid var(--background-modifier-border)' });
			itemEl.addClass('ia-clickable');
			
			if (this.selectedItems.some(selected => selected.path === item.path)) {
				itemEl.setCssProps({ 'background-color': 'var(--background-modifier-active)' });
			}
			
			// Add icon
			const iconEl = itemEl.createDiv();
			iconEl.setCssProps({ 'margin-right': '8px' });
			iconEl.setText(item instanceof TFolder ? '📁' : '📄');
			
			// Add path text
			const textEl = itemEl.createDiv();
			textEl.setCssProps({ 'flex': '1' });
			textEl.setText(item.path);
			
			// Add click event to toggle selection
			itemEl.addEventListener('click', () => {
				const isSelected = this.selectedItems.some(selected => selected.path === item.path);
				
				if (isSelected) {
					// Remove from selection
					this.selectedItems = this.selectedItems.filter(selected => selected.path !== item.path);
				} else {
					// Add to selection
					this.selectedItems.push(item);
				}
				
				this.updateDisplay();
			});
		});
	}
	
	private updateDisplay() {
		// Refresh the display to show selection state
		const query = this.searchInput.value.toLowerCase();
		const currentItems = this.allItems.filter(item => 
			item.path.toLowerCase().includes(query)
		);
		this.displayItems(currentItems);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SearchableImageModal extends Modal {
	private onChooseFiles: (files: TFile[]) => void;
	private searchInput: HTMLInputElement;
	private resultsContainer: HTMLElement;
	private allImageFiles: TFile[];
	private selectedFiles: TFile[] = [];

	constructor(app: App, onChooseFiles: (files: TFile[]) => void) {
		super(app);
		this.onChooseFiles = onChooseFiles;
		
		// Get all image files
		const files = app.vault.getFiles();
		this.allImageFiles = files.filter(f =>
			f.extension === 'png' || f.extension === 'jpg' ||
			f.extension === 'jpeg' || f.extension === 'gif' || f.extension === 'webp'
		);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('searchable-image-modal');

		contentEl.createEl('h2', { text: 'Attach images' });

		// Search input
		this.searchInput = contentEl.createEl('input', {
			type: 'text',
			placeholder: 'Search images...'
		});
		this.searchInput.setCssProps({ 'width': '100%' });
		this.searchInput.setCssProps({ 'padding': '8px' });
		this.searchInput.setCssProps({ 'margin-bottom': '10px' });
		this.searchInput.setCssProps({ 'border': '1px solid var(--background-modifier-border)' });
		this.searchInput.setCssProps({ 'border-radius': '4px' });

		// Results container
		this.resultsContainer = contentEl.createDiv();
		this.resultsContainer.setCssProps({ 'max-height': '400px' });
		this.resultsContainer.setCssProps({ 'overflow-y': 'auto' });

		// Initial display of all images
		this.displayImages(this.allImageFiles);

		// Add search event listener
		this.searchInput.addEventListener('input', (e) => {
			const query = (e.target as HTMLInputElement).value.toLowerCase();
			const filteredFiles = this.allImageFiles.filter((file: TFile) => 
				file.path.toLowerCase().includes(query)
			);
			this.displayImages(filteredFiles);
		});

		// Add Enter key support for the search input
		this.searchInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && this.selectedFiles.length > 0) {
				this.close();
				this.onChooseFiles(this.selectedFiles);
			}
		});

		// Add button container with actions
		const buttonContainer = contentEl.createDiv();
		buttonContainer.removeClass('ia-hidden');
		buttonContainer.setCssProps({ 'justify-content': 'space-between' });
		buttonContainer.setCssProps({ 'margin-top': '10px' });
		
		const selectAllButton = buttonContainer.createEl('button', { text: 'Select all' });
		selectAllButton.addEventListener('click', () => {
			this.selectedFiles = [...this.allImageFiles];
			this.updateDisplay();
		});
		
		const selectNoneButton = buttonContainer.createEl('button', { text: 'Select none' });
		selectNoneButton.addEventListener('click', () => {
			this.selectedFiles = [];
			this.updateDisplay();
		});
		
		const addButton = buttonContainer.createEl('button', { text: 'Add selected' });
		addButton.addClass('mod-cta');
		addButton.addEventListener('click', () => {
			this.close();
			this.onChooseFiles(this.selectedFiles);
		});
	}

	private displayImages(files: TFile[]) {
		this.resultsContainer.empty();
		
		if (files.length === 0) {
			this.resultsContainer.createDiv({ text: 'No matching images found.' });
			return;
		}

		files.forEach(file => {
			const itemEl = this.resultsContainer.createDiv('image-item');
			itemEl.removeClass('ia-hidden');
			itemEl.setCssProps({ 'align-items': 'center' });
			itemEl.setCssProps({ 'padding': '6px' });
			itemEl.setCssProps({ 'border-bottom': '1px solid var(--background-modifier-border)' });
			itemEl.addClass('ia-clickable');
			
			if (this.selectedFiles.some(selected => selected.path === file.path)) {
				itemEl.setCssProps({ 'background-color': 'var(--background-modifier-active)' });
			}
			
			// Add icon
			const iconEl = itemEl.createDiv();
			iconEl.setCssProps({ 'margin-right': '8px' });
			iconEl.setText('🖼️');
			
			// Add path text
			const textEl = itemEl.createDiv();
			textEl.setCssProps({ 'flex': '1' });
			textEl.setText(file.path);
			
			// Add click event to toggle selection
			itemEl.addEventListener('click', () => {
				const isSelected = this.selectedFiles.some(selected => selected.path === file.path);
				
				if (isSelected) {
					// Remove from selection
					this.selectedFiles = this.selectedFiles.filter(selected => selected.path !== file.path);
				} else {
					// Add to selection
					this.selectedFiles.push(file);
				}
				
				this.updateDisplay();
			});
		});
	}
	
	private updateDisplay() {
		// Refresh the display to show selection state
		const query = this.searchInput.value.toLowerCase();
		const currentFiles = this.allImageFiles.filter((file: TFile) => 
			file.path.toLowerCase().includes(query)
		);
		this.displayImages(currentFiles);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}


class SingleFileSelectionModal extends Modal {
	private onChooseFile: (file: TFile | null) => void;
	private searchInput: HTMLInputElement;
	private resultsContainer: HTMLElement;
	private allFiles: TFile[];
	private selectedFile: TFile | null = null;

	constructor(app: App, onChooseFile: (file: TFile | null) => void) {
		super(app);
		this.onChooseFile = onChooseFile;
		
		// Get all markdown files
		const files = app.vault.getFiles();
		this.allFiles = files.filter(f => f.extension === "md");
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("single-file-selection-modal");

		contentEl.createEl("h2", { text: "Insert to note" });

		// Search input
		this.searchInput = contentEl.createEl("input", {
			type: "text",
			placeholder: "Search notes..."
		});
		this.searchInput.setCssProps({ 'width': "100%" });
		this.searchInput.setCssProps({ 'padding': "8px" });
		this.searchInput.setCssProps({ 'margin-bottom': "10px" });
		this.searchInput.setCssProps({ 'border': "1px solid var(--background-modifier-border)" });
		this.searchInput.setCssProps({ 'border-radius': "4px" });

		// Results container
		this.resultsContainer = contentEl.createDiv();
		this.resultsContainer.setCssProps({ 'max-height': "400px" });
		this.resultsContainer.setCssProps({ 'overflow-y': "auto" });

		// Initial display of all items
		this.displayFiles(this.allFiles);

		// Add search event listener
		this.searchInput.addEventListener("input", (e) => {
			const query = (e.target as HTMLInputElement).value.toLowerCase();
			const filteredFiles = this.allFiles.filter(file => 
				file.path.toLowerCase().includes(query)
			);
			this.displayFiles(filteredFiles);
		});

		// Add Enter key support for the search input
		this.searchInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && this.selectedFile) {
				this.close();
				this.onChooseFile(this.selectedFile);
			}
		});

		// Add button container with actions
		const buttonContainer = contentEl.createDiv();
		buttonContainer.removeClass('ia-hidden');
		buttonContainer.setCssProps({ 'justify-content': "flex-end" });
		buttonContainer.setCssProps({ 'margin-top': "10px" });
		
		const insertButton = buttonContainer.createEl("button", { text: "Insert to selected note" });
		insertButton.addClass("mod-cta");
		insertButton.addEventListener("click", () => {
			this.close();
			this.onChooseFile(this.selectedFile);
		});
		
		// Add "Create New Note" button
		const newNoteButton = buttonContainer.createEl("button", { text: "Create new note" });
		newNoteButton.setCssProps({ 'margin-right': "10px" });
		newNoteButton.addEventListener("click", () => {
			this.close();
			this.onChooseFile(null); // Signal to create a new note
		});
	}

	private displayFiles(files: TFile[]) {
		this.resultsContainer.empty();
		
		if (files.length === 0) {
			this.resultsContainer.createDiv({ text: "No matching notes found." });
			return;
		}

		files.forEach(file => {
			const fileEl = this.resultsContainer.createDiv("file-item");
			fileEl.removeClass('ia-hidden');
			fileEl.setCssProps({ 'align-items': "center" });
			fileEl.setCssProps({ 'padding': "6px" });
			fileEl.setCssProps({ 'border-bottom': "1px solid var(--background-modifier-border)" });
			fileEl.addClass('ia-clickable');
			
			if (this.selectedFile && this.selectedFile.path === file.path) {
				fileEl.setCssProps({ 'background-color': "var(--background-modifier-active)" });
			}
			
			// Add icon
			const iconEl = fileEl.createDiv();
			iconEl.setCssProps({ 'margin-right': "8px" });
			iconEl.setText("📄");
			
			// Add path text
			const textEl = fileEl.createDiv();
			textEl.setCssProps({ 'flex': "1" });
			textEl.setText(file.path);
			
			// Add click event to select the file
			fileEl.addEventListener("click", () => {
				this.selectedFile = file;
				this.updateDisplay();
			});
		});
	}
	
	private updateDisplay() {
		// Refresh the display to show selection state
		const query = this.searchInput.value.toLowerCase();
		const currentFiles = this.allFiles.filter(file => 
			file.path.toLowerCase().includes(query)
		);
		this.displayFiles(currentFiles);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
