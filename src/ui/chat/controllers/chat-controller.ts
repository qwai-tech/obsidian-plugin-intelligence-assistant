/**
 * Chat Controller
 * Owns the full message-sending pipeline previously in ChatView.
 */
import { Notice, TFolder } from 'obsidian';
import { BaseController } from './base-controller';
import { t } from '@/i18n/index';
import type { Message } from '@/features/conversations/types/conversation';
import type { LLMConfig } from '@/features/llm/types/model';
import type { FileReference } from '@/features/chat/types/attachments';
import type { ChatService } from '@/features/chat/chat.service';
import { renderAssistantMarkdown, appendTokenUsageToMessage } from '@/ui/chat/message-renderer';
import { renderLiveTrace } from '@/ui/chat/agent-trace-view';
import type { ConversationManager } from '@/ui/chat/managers/conversation-manager';
import type { RagStatusPanel } from '@/ui/chat/rag-status-panel';
import type { StreamChunk } from '@/features/llm/types/llm';
import type { RAGSource } from '@/features/knowledge/types/rag';
import { errorMessage } from '@/core/utils/errors';

export interface ChatControllerOptions {
	chatContainer: HTMLElement;
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
}

export class ChatController extends BaseController {
	private chatContainer!: HTMLElement;
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
		this.chatContainer = options.chatContainer;
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

	async sendMessage(text: string, options?: { llmContentOverride?: string }): Promise<void> {
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

		// In agent mode the sense service inlines reference content once ("Explicit
		// references"), so don't also embed it in the message — that would double the
		// per-turn token cost. Chat mode has no sense pass, so it keeps the embed.
		const embedReferenceContent = this.state.mode !== 'agent';
		const { llmContent, references } = options?.llmContentOverride
			? { llmContent: options.llmContentOverride, references: referenceInputs }
			: await this.chatService.buildReferenceContext(text, referenceInputs, { embedContent: embedReferenceContent });

		const attachments = [...this.state.currentAttachments];
		this.state.currentAttachments = [];
		this.state.referencedFiles = [];
		this.clearInputUI();

		const userMessage: Message = {
			role: 'user',
			content: text,
			attachments: attachments.length > 0 ? attachments : undefined,
			references: references.length > 0 ? references : undefined,
		};
		this.state.messages.push(userMessage);
		this.addMessageToUI(userMessage);

		try {
			await this.handleAssistantResponse({ text, selectedModel, config, llmContent, targetMessage: userMessage });
		} catch (_error) {
			const errMsg = errorMessage(_error);
			new Notice(t('chat.notices.chatError', { message: errMsg }));
			const failureMessage: Message = {
				role: 'assistant',
				content: `❌ **Error:** ${errMsg}`,
				model: selectedModel,
			};
			(failureMessage as { provider?: string | null }).provider = config.provider ?? null;
			this.state.messages.push(failureMessage);
			this.addMessageToUI(failureMessage);
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
			const errMsg = errorMessage(_error);
			new Notice(t('chat.notices.regenerateFailed', { message: errMsg }));
			this.state.messages.push(originalAssistant);
			this.addMessageToUI(originalAssistant);
		}
	}

	stopGeneration(): void {
		this.state.stopRun();
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
		this.state.endRun();
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
		const signal = this.state.startRun();
		this.onStreamingStateChange(true);

		let currentRagSources: RAGSource[] = [];

		try {
			if (this.state.mode === 'agent') {
				await this.runAgentLoop(
					llmMessages, selectedModel, contextWindow, activeSystemPrompts,
					placeholderAssistant, assistantMessageEl, contentEl,
					targetMessage.references ?? [], signal
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
					enableWebSearch: this.state.enableWebSearch && this.plugin.settings.webSearchConfig.enabled,
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
							try {
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
							} finally {
								this.finalizeStreamingUI();
							}
						})();
					},
					onError: (error: Error) => {
						new Notice(t('chat.notices.chatError', { message: error.message }));
						void (async () => {
							try {
								const failedMessage: Message = {
									role: 'assistant',
									content: `❌ **Error:** ${error.message}`,
									model: selectedModel,
									provider: config.provider ?? undefined,
								};
								const index = this.state.messages.indexOf(placeholderAssistant);
								if (index !== -1) {
									this.state.messages[index] = failedMessage;
								} else {
									this.state.messages.push(failedMessage);
								}
								if (contentEl) {
									renderAssistantMarkdown(contentEl, failedMessage.content);
								}
								this.updateTokenSummary();
								await this.conversationManager.saveCurrentConversation();
							} finally {
								this.finalizeStreamingUI();
							}
						})();
					},
					signal,
				}
			);
		} catch (error) {
			this.finalizeStreamingUI();
			throw error;
		}
	}

	private createLiveTrace(messageEl: HTMLElement, contentEl: HTMLElement | null): () => void {
		const body = this.findMessageBodyElement(messageEl);
		if (!body) {
			return () => undefined;
		}
		const trace = body.createDiv('ia-live-trace');
		if (contentEl?.parentElement === body) {
			body.insertBefore(trace, contentEl);
		}
		return () => renderLiveTrace(trace, this.state.agentExecutionSteps);
	}

	private async runAgentLoop(
		llmMessages: Message[],
		selectedModel: string,
		contextWindow: number,
		activeSystemPrompts: Message[],
		placeholderAssistant: Message,
		assistantMessageEl: HTMLElement,
		contentEl: HTMLElement | null,
		references: FileReference[],
		signal: AbortSignal,
	): Promise<void> {
		const isGenericAgent = !this.plugin.settings.activeAgentId;
		const activeAgent = this.getActiveAgent();

		this.state.agentExecutionSteps = [];
		const refreshTrace = this.createLiveTrace(assistantMessageEl, contentEl);

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
				enableRAG: Boolean(activeAgent?.ragEnabled && this.plugin.settings.ragConfig.enabled),
				enableWebSearch: Boolean(activeAgent?.webSearchEnabled && this.plugin.settings.webSearchConfig.enabled),
				activeSystemPrompts,
				contextWindow,
				agentId: this.plugin.settings.activeAgentId ?? undefined,
				agents: this.plugin.settings.agents,
				isGenericAgent,
				conversationId: this.state.currentConversationId ?? undefined,
				references,
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
				onToolCall: (toolName, args, thinking, phase) => {
					this.state.agentExecutionSteps.push({
						type: 'action',
						content: `${toolName}(${JSON.stringify(args)})`,
						toolName,
						args,
						thinking: thinking || undefined,
						phase,
						timestamp: Date.now(),
						status: 'pending',
					});
					refreshTrace();
				},
				onToolResult: (_toolName, success, output, phase) => {
					const lastAction = [...this.state.agentExecutionSteps].reverse().find(s => s.type === 'action' && s.status === 'pending');
					if (lastAction) {
						lastAction.status = success ? 'success' : 'error';
						lastAction.result = output;
						lastAction.phase = lastAction.phase ?? phase;
					}
					refreshTrace();
				},
				onThought: (thought, phase) => {
					this.state.agentExecutionSteps.push({
						type: 'thought',
						content: thought,
						phase,
						timestamp: Date.now(),
					});
					refreshTrace();
				},
				onComplete: (finalMessage) => {
					void (async () => {
						try {
							if (this.state.agentExecutionSteps.length > 0) {
								finalMessage.agentExecutionSteps = [...this.state.agentExecutionSteps];
							}
							const index = this.state.messages.indexOf(placeholderAssistant);
							if (index !== -1) {
								this.state.messages[index] = finalMessage;
							} else {
								this.state.messages.push(finalMessage);
							}

							if (assistantMessageEl.isConnected) {
								assistantMessageEl.remove();
							}
							const finalMessageEl = this.addMessageToUI(finalMessage);
							if (finalMessage.tokenUsage) {
								appendTokenUsageToMessage(finalMessageEl, finalMessage.tokenUsage);
							}
							this.updateTokenSummary();
							if (finalMessage.ragSources?.length) {
								const messageBody = this.findMessageBodyElement(finalMessageEl);
								if (messageBody) this.ragStatusPanel.displaySources(messageBody, finalMessage.ragSources);
							}
							await this.conversationManager.saveCurrentConversation();
						} finally {
							this.finalizeStreamingUI();
						}
					})();
				},
				onError: (error) => {
					new Notice(t('chat.notices.chatError', { message: error.message }));
					this.finalizeStreamingUI();
				},
				signal,
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
}
