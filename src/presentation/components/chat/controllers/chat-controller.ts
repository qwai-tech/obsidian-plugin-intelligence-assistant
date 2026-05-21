/**
 * Chat Controller
 * Owns the full message-sending pipeline previously in ChatView.
 */
import { Notice, TFolder } from 'obsidian';
import { BaseController } from './base-controller';
import { t } from '@/i18n';
import { MessageController } from './message-controller';
import { AgentController } from './agent-controller';
import type { Message, LLMConfig, ModelInfo, FileReference } from '@/types';
import type { ChatService } from '@/application/services/chat.service';
import { renderAssistantMarkdown, appendTokenUsageToMessage } from '@/presentation/components/chat/message-renderer';
import type { ConversationManager } from '@/presentation/components/chat/managers/conversation-manager';
import type { RagStatusPanel } from '@/presentation/components/chat/rag-status-panel';
import type { StreamChunk } from '@/types/common/llm';
import type { RAGSource } from '@/types';

export interface ChatUICallbacks {
	onChunk: (chunk: StreamChunk) => void;
	onComplete: (message: Message) => void;
	onError: (error: Error) => void;
	onRagSources?: (sources: unknown[]) => void;
	onWebSearch?: (results: unknown[]) => void;
	checkAbort?: () => boolean;
}

export interface ChatControllerOptions {
	messagesContainer: HTMLElement;
	chatContainer: HTMLElement;
	messageController: MessageController;
	agentController: AgentController;
	chatService: ChatService;
	conversationManager: ConversationManager;
	ragStatusPanel: RagStatusPanel;
	getSelectedModel: () => string;
	clearInputUI: () => void;
	addMessageToUI: (msg: Message) => HTMLElement;
	updateTokenSummary: () => void;
	findMessageContentElement: (el: HTMLElement) => HTMLElement | null;
	findMessageBodyElement: (el: HTMLElement) => HTMLElement | null;
	onStreamingStateChange: (isStreaming: boolean) => void;
	uiCallbacks?: ChatUICallbacks;
}

export class ChatController extends BaseController {
	private messagesContainer!: HTMLElement;
	private chatContainer!: HTMLElement;
	private messageController!: MessageController;
	private agentController!: AgentController;
	private chatService!: ChatService;
	private conversationManager!: ConversationManager;
	private ragStatusPanel!: RagStatusPanel;
	private getSelectedModel!: () => string;
	private clearInputUI!: () => void;
	private addMessageToUI!: (msg: Message) => HTMLElement;
	private updateTokenSummary!: () => void;
	private findMessageContentElement!: (el: HTMLElement) => HTMLElement | null;
	private findMessageBodyElement!: (el: HTMLElement) => HTMLElement | null;
	private onStreamingStateChange!: (isStreaming: boolean) => void;

	protected get plugin() { return this._plugin; }
	protected get app() { return this._app; }

	async initialize(): Promise<void> {}
	cleanup(): void { this.state.isStreaming = false; }

	configure(options: ChatControllerOptions): void {
		this.messagesContainer = options.messagesContainer;
		this.chatContainer = options.chatContainer;
		this.messageController = options.messageController;
		this.agentController = options.agentController;
		this.chatService = options.chatService;
		this.conversationManager = options.conversationManager;
		this.ragStatusPanel = options.ragStatusPanel;
		this.getSelectedModel = options.getSelectedModel;
		this.clearInputUI = options.clearInputUI;
		this.addMessageToUI = options.addMessageToUI;
		this.updateTokenSummary = options.updateTokenSummary;
		this.findMessageContentElement = options.findMessageContentElement;
		this.findMessageBodyElement = options.findMessageBodyElement;
		this.onStreamingStateChange = options.onStreamingStateChange;
	}

	async sendMessage(text: string): Promise<void> {
		if (this.state.isStreaming) {
			new Notice(t('chat.notices.waitForResponse'));
			return;
		}

		if (this.plugin.settings.llmConfigs.length === 0) {
			new Notice(t('chat.notices.configureProvider'));
			return;
		}

		const selectedModel = this.getSelectedModel();
		if (!selectedModel) {
			new Notice(t('chat.notices.selectModel'));
			return;
		}

		const config = this.chatService.findLLMConfig(selectedModel);
		if (!config) {
			new Notice(t('chat.notices.noValidProvider'));
			return;
		}

		const referenceInputs: FileReference[] = this.state.referencedFiles.map(item => ({
			type: item instanceof TFolder ? 'folder' : 'file',
			path: item.path,
			name: item.name,
		}));

		const { llmContent, references } = await this.chatService.buildReferenceContext(text, referenceInputs);

		this.state.currentAttachments = [];
		this.state.referencedFiles = [];
		this.clearInputUI();

		const userMessage: Message = {
			role: 'user',
			content: text,
			attachments: undefined,
			references: references.length > 0 ? references : undefined,
		};
		this.state.messages.push(userMessage);
		this.addMessageToUI(userMessage);

		try {
			await this.handleAssistantResponse({ text, selectedModel, config, llmContent, targetMessage: userMessage });
		} catch (_error) {
			const errMsg = _error instanceof Error ? _error.message : String(_error);
			new Notice(t('chat.notices.chatError', { message: errMsg }));
			const errorMessage: Message = {
				role: 'assistant',
				content: `❌ **Error:** ${errMsg}`,
				model: selectedModel,
			};
			(errorMessage as { provider?: string | null }).provider = config.provider ?? null;
			this.state.messages.push(errorMessage);
			this.addMessageToUI(errorMessage);
			await this.conversationManager.saveCurrentConversation();
		}
	}

	async regenerateMessage(message: Message, messageEl?: HTMLElement): Promise<void> {
		if (message.role !== 'assistant') return;
		if (this.state.isStreaming) {
			new Notice(t('chat.notices.waitForResponse'));
			return;
		}

		const assistantIndex = this.state.messages.indexOf(message);
		if (assistantIndex === -1) {
			new Notice(t('chat.notices.noMessageToRegenerate'));
			return;
		}
		if (assistantIndex !== this.state.messages.length - 1) {
			new Notice(t('chat.notices.regenerateOnlyLatest'));
			return;
		}

		const previousUser = this.findPreviousUserMessage(assistantIndex);
		if (!previousUser) {
			new Notice(t('chat.notices.regenerateNoUserMsg'));
			return;
		}

		const selectedModel = this.getSelectedModel();
		if (!selectedModel) {
			new Notice(t('chat.notices.selectModel'));
			return;
		}

		const config = this.chatService.findLLMConfig(selectedModel);
		if (!config) {
			new Notice(t('chat.notices.noValidProvider'));
			return;
		}

		const { llmContent } = await this.chatService.buildReferenceContext(
			previousUser.message.content,
			previousUser.message.references || []
		);

		if (messageEl?.isConnected) messageEl.remove();
		this.state.messages.splice(assistantIndex, 1);
		const originalAssistant = message;

		try {
			await this.handleAssistantResponse({
				text: previousUser.message.content,
				selectedModel,
				config,
				llmContent,
				targetMessage: previousUser.message,
			});
			new Notice(t('chat.notices.regenerated'));
		} catch (_error) {
			const errMsg = _error instanceof Error ? _error.message : String(_error);
			new Notice(t('chat.notices.regenerateFailed', { message: errMsg }));
			this.state.messages.push(originalAssistant);
			this.addMessageToUI(originalAssistant);
		}
	}

	stopGeneration(): void {
		this.state.stopStreamingRequested = true;
		new Notice(t('chat.notices.generationStopped'));
	}

	isCurrentlyGenerating(): boolean {
		return this.state.isStreaming;
	}

	async generateResponse(): Promise<void> {}

	async regenerateResponse(): Promise<void> {
		const messages = this.state.messages;
		if (messages.length < 2) return;
		const last = messages[messages.length - 1];
		if (last.role === 'assistant') await this.regenerateMessage(last);
	}

	private finalizeStreamingUI(): void {
		this.state.isStreaming = false;
		this.state.stopStreamingRequested = false;
		this.onStreamingStateChange(false);
	}

	private async handleAssistantResponse(options: {
		text: string;
		selectedModel: string;
		config: LLMConfig;
		llmContent: string;
		targetMessage: Message;
	}): Promise<void> {
		const { selectedModel, config, llmContent, targetMessage } = options;

		const activeSystemPrompts: Message[] = [];
		if (this.plugin.settings.activeSystemPromptId) {
			const activePrompt = this.plugin.settings.systemPrompts.find(
				(p: { id: string; enabled: boolean }) => p.id === this.plugin.settings.activeSystemPromptId
			);
			if (activePrompt && activePrompt.enabled) {
				activeSystemPrompts.push({ role: 'system', content: activePrompt.content });
			}
		}

		const contextWindow = this.getActiveAgent()?.contextWindow ?? 20;
		const llmMessages = this.chatService.prepareLlmMessages(
			this.state.messages, targetMessage, llmContent, contextWindow
		);

		const placeholderAssistant: Message = {
			role: 'assistant',
			content: '',
			model: selectedModel,
			provider: config.provider ?? undefined,
		};
		const assistantMessageEl = this.addMessageToUI(placeholderAssistant);
		const contentEl = this.findMessageContentElement(assistantMessageEl);

		this.state.isStreaming = true;
		this.state.stopStreamingRequested = false;
		this.onStreamingStateChange(true);

		let currentRagSources: RAGSource[] = [];

		try {
			if (this.state.mode === 'agent') {
				await this.runAgentLoop(
					llmMessages, selectedModel, contextWindow, activeSystemPrompts,
					placeholderAssistant, assistantMessageEl, contentEl
				);
				return;
			}

			await this.chatService.streamResponse(
				llmMessages,
				{
					model: selectedModel,
					mode: this.state.mode,
					temperature: this.state.temperature,
					maxTokens: this.state.maxTokens,
					topP: this.state.topP,
					frequencyPenalty: this.state.frequencyPenalty,
					presencePenalty: this.state.presencePenalty,
					enableRAG: this.state.enableRAG && this.plugin.settings.ragConfig.enabled,
					enableWebSearch: this.state.enableWebSearch,
					activeSystemPrompts,
					conversationId: this.state.currentConversationId ?? undefined,
				},
				{
					onChunk: (chunk: StreamChunk) => {
						if (contentEl && chunk.content) {
							contentEl.appendText(chunk.content);
							this.chatContainer.scrollTo({ top: this.chatContainer.scrollHeight, behavior: 'smooth' });
						}
					},
					onRAGSources: (sources: RAGSource[]) => { currentRagSources = sources; },
					onWebSearch: () => {},
					onComplete: (finalMessage: Message) => {
						void (async () => {
							const index = this.state.messages.indexOf(placeholderAssistant);
							if (index !== -1) {
								this.state.messages[index] = finalMessage;
							} else {
								this.state.messages.push(finalMessage);
							}
							if (contentEl && finalMessage.content) {
								renderAssistantMarkdown(contentEl, finalMessage.content);
							}
							if (assistantMessageEl && finalMessage.tokenUsage) {
								appendTokenUsageToMessage(assistantMessageEl, finalMessage.tokenUsage);
							}
							this.updateTokenSummary();
							if (currentRagSources.length > 0 && assistantMessageEl) {
								const messageBody = this.findMessageBodyElement(assistantMessageEl);
								if (messageBody) this.ragStatusPanel.displaySources(messageBody, currentRagSources);
							}
							await this.conversationManager.saveCurrentConversation();
							this.finalizeStreamingUI();
						})();
					},
					onError: (error: Error) => {
						new Notice(t('chat.notices.chatError', { message: error.message }));
						this.finalizeStreamingUI();
					},
					checkAbort: () => this.state.stopStreamingRequested,
				}
			);
		} catch (error) {
			this.finalizeStreamingUI();
			throw error;
		}
	}

	private async runAgentLoop(
		llmMessages: Message[],
		selectedModel: string,
		contextWindow: number,
		activeSystemPrompts: Message[],
		placeholderAssistant: Message,
		assistantMessageEl: HTMLElement,
		contentEl: HTMLElement | null
	): Promise<void> {
		const isGenericAgent = !this.plugin.settings.activeAgentId;

		await this.chatService.executeAgentLoop(
			llmMessages,
			{
				model: selectedModel,
				mode: 'agent',
				temperature: this.state.temperature,
				maxTokens: this.state.maxTokens,
				topP: this.state.topP,
				frequencyPenalty: this.state.frequencyPenalty,
				presencePenalty: this.state.presencePenalty,
				enableRAG: this.state.enableRAG && this.plugin.settings.ragConfig.enabled,
				enableWebSearch: this.state.enableWebSearch,
				activeSystemPrompts,
				contextWindow,
				agentId: this.plugin.settings.activeAgentId ?? undefined,
				agents: this.plugin.settings.agents,
				isGenericAgent,
				allowOpenApiTools: this.plugin.hasEnabledOpenApiTools(),
				conversationId: this.state.currentConversationId ?? undefined,
			},
			{
				onChunk: (chunk) => {
					if (contentEl && chunk.content) {
						contentEl.appendText(chunk.content);
						this.chatContainer.scrollTo({ top: this.chatContainer.scrollHeight, behavior: 'smooth' });
					}
				},
				onTokenUsage: (_step, cumulativeTokens, budget) => {
					void cumulativeTokens; void budget;
				},
				onToolCall: (toolName, args) => {
					this.state.agentExecutionSteps.push({
						type: 'action',
						content: `${toolName}(${JSON.stringify(args)})`,
						timestamp: Date.now(),
						status: 'pending',
					});
				},
				onToolResult: (_toolName, success, output) => {
					const lastAction = [...this.state.agentExecutionSteps].reverse().find(s => s.type === 'action');
					if (lastAction) lastAction.status = success ? 'success' : 'error';
					this.state.agentExecutionSteps.push({
						type: 'observation',
						content: output,
						timestamp: Date.now(),
						status: success ? 'success' : 'error',
					});
				},
				onThought: (thought) => {
					this.state.agentExecutionSteps.push({
						type: 'thought',
						content: thought,
						timestamp: Date.now(),
					});
				},
				onComplete: (finalMessage) => {
					void (async () => {
						const index = this.state.messages.indexOf(placeholderAssistant);
						if (index !== -1) {
							this.state.messages[index] = finalMessage;
						} else {
							this.state.messages.push(finalMessage);
						}
						if (contentEl && finalMessage.content) {
							renderAssistantMarkdown(contentEl, finalMessage.content);
						}
						if (assistantMessageEl && finalMessage.tokenUsage) {
							appendTokenUsageToMessage(assistantMessageEl, finalMessage.tokenUsage);
						}
						this.updateTokenSummary();
						if (finalMessage.ragSources?.length && assistantMessageEl) {
							const messageBody = this.findMessageBodyElement(assistantMessageEl);
							if (messageBody) this.ragStatusPanel.displaySources(messageBody, finalMessage.ragSources);
						}
						await this.conversationManager.saveCurrentConversation();
						this.finalizeStreamingUI();
					})();
				},
				onError: (error) => {
					new Notice(t('chat.notices.chatError', { message: error.message }));
					this.finalizeStreamingUI();
				},
				checkAbort: () => this.state.stopStreamingRequested,
			}
		);
	}

	private findPreviousUserMessage(startIndex: number): { message: Message; index: number } | null {
		for (let i = startIndex - 1; i >= 0; i--) {
			const candidate = this.state.messages[i];
			if (candidate.role === 'user') return { message: candidate, index: i };
		}
		return null;
	}

	private getActiveAgent() {
		const activeId = this.plugin.settings.activeAgentId;
		if (!activeId) return null;
		return this.plugin.settings.agents.find((a: { id: string }) => a.id === activeId) || null;
	}

	private getModelConfig(agent: { modelStrategy: { strategy: string; modelId?: string } }, currentModel?: string): LLMConfig | null {
		const effectiveModelId = this.getAgentModelId(agent, currentModel);
		const model = this.getModelInfo(effectiveModelId);
		if (!model) return null;
		return this.plugin.settings.llmConfigs.find((c: LLMConfig) => c.provider === model.provider) || null;
	}

	private getAgentModelId(agent: { modelStrategy: { strategy: string; modelId?: string } }, currentModel?: string): string {
		switch (agent.modelStrategy.strategy) {
			case 'fixed': return agent.modelStrategy.modelId || this.plugin.settings.defaultModel || '';
			case 'chat-view': return currentModel || this.plugin.settings.defaultModel || '';
			default: return this.plugin.settings.defaultModel || '';
		}
	}

	private getModelInfo(modelId: string): ModelInfo | null {
		for (const config of this.plugin.settings.llmConfigs) {
			const model = config.cachedModels?.find((m: ModelInfo) => m.id === modelId);
			if (model) return model;
		}
		return null;
	}
}
