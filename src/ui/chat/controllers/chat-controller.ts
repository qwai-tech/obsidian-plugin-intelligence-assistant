import { Notice, TFolder } from 'obsidian';
import { BaseController } from './base-controller';
import { t } from '@/i18n';
import type { Message } from '@/features/conversations';
import type { LLMConfig, StreamChunk } from '@/features/llm';
import type { FileReference, ChatService } from '@/features/chat';
import { renderAssistantMarkdown } from '@/ui/chat/message-renderer';
import { appendTokenUsageToMessage } from '@/ui/chat/message-footer';
import { renderLiveTrace } from '@/ui/chat/agent-trace-view';
import { AgentTraceRecorder } from '@/ui/chat/agent-trace-recorder';
import type { ConversationManager } from '@/ui/chat/managers/conversation-manager';
import type { RagStatusPanel } from '@/ui/chat/rag-status-panel';
import type { RAGSource } from '@/features/knowledge';
import { errorMessage } from '@/core/utils/errors';
import { errorReply, type Reply } from './chat-reply';

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
	private options!: ChatControllerOptions;

	protected get plugin() { return this._plugin; }

	async initialize(): Promise<void> {}
	cleanup(): void { this.state.isStreaming = false; }

	configure(options: ChatControllerOptions): void {
		this.options = options;
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

		const target = this.resolveModel();
		if (!target) return;
		const { selectedModel, config } = target;

		const referenceInputs: FileReference[] = this.state.referencedFiles.map(item => ({
			type: item instanceof TFolder ? 'folder' : 'file',
			path: item.path,
			name: item.name,
		}));

		const embedReferenceContent = this.state.mode !== 'agent';
		const { llmContent, references } = options?.llmContentOverride
			? { llmContent: options.llmContentOverride, references: referenceInputs }
			: await this.options.chatService.buildReferenceContext(text, referenceInputs, { embedContent: embedReferenceContent });

		const attachments = [...this.state.currentAttachments];
		this.state.currentAttachments = [];
		this.state.referencedFiles = [];
		this.options.clearInputUI();

		const userMessage: Message = {
			role: 'user',
			content: text,
			attachments: attachments.length > 0 ? attachments : undefined,
			references: references.length > 0 ? references : undefined,
		};
		this.state.messages.push(userMessage);
		this.options.addMessageToUI(userMessage);

		try {
			await this.handleAssistantResponse({ text, selectedModel, config, llmContent, targetMessage: userMessage });
		} catch (_error) {
			new Notice(t('chat.notices.chatError', { message: errorMessage(_error) }));
			const failureMessage = errorReply(_error, selectedModel, config);
			this.state.messages.push(failureMessage);
			this.options.addMessageToUI(failureMessage);
			await this.options.conversationManager.saveCurrentConversation();
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

		const target = this.resolveModel();
		if (!target) return;
		const { selectedModel, config } = target;

		const { llmContent } = await this.options.chatService.buildReferenceContext(
			previousUser.message.content,
			previousUser.message.references || [],
			{ embedContent: this.state.mode !== 'agent' }
		);

		if (messageEl?.isConnected) messageEl.remove();
		this.state.messages.splice(assistantIndex, 1);

		let reply: Reply | null = null;
		try {
			reply = await this.handleAssistantResponse({
				text: previousUser.message.content,
				selectedModel,
				config,
				llmContent,
				targetMessage: previousUser.message,
			});
		} catch (error) {
			new Notice(t('chat.notices.regenerateFailed', { message: errorMessage(error) }));
		}
		if (reply?.ok) {
			new Notice(t('chat.notices.regenerated'));
			return;
		}
		await this.restoreOriginal(message, reply);
	}

	private async restoreOriginal(original: Message, failed: Reply | null): Promise<void> {
		if (failed) {
			failed.element.remove();
			const index = this.state.messages.indexOf(failed.message);
			if (index !== -1) this.state.messages.splice(index, 1);
		}
		this.state.messages.push(original);
		this.options.addMessageToUI(original);
		await this.options.conversationManager.saveCurrentConversation();
	}

	private finalizeStreamingUI(): void {
		this.state.isStreaming = false;
		this.state.endRun();
		this.options.onStreamingStateChange(false);
	}

	private async handleAssistantResponse(options: {
		text: string;
		selectedModel: string;
		config: LLMConfig;
		llmContent: string;
		targetMessage: Message;
	}): Promise<Reply> {
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
		const llmMessages = this.options.chatService.prepareLlmMessages(
			this.state.messages, targetMessage, llmContent, contextWindow
		);

		const placeholderAssistant: Message = {
			role: 'assistant',
			content: '',
			model: selectedModel,
			provider: config.provider ?? undefined,
		};
		const assistantMessageEl = this.options.addMessageToUI(placeholderAssistant);
		const contentEl = this.options.findMessageContentElement(assistantMessageEl);

		this.state.isStreaming = true;
		const signal = this.state.startRun();
		this.options.onStreamingStateChange(true);

		let currentRagSources: RAGSource[] = [];
		let settled: Promise<Reply> | null = null;
		const settle = (ok: boolean, message: Message, show: () => HTMLElement, ragSources?: RAGSource[]) => {
			let element = assistantMessageEl;
			settled = this.finishReply(message, () => (element = show()), ragSources).then(() => ({ ok, message, element }));
		};

		try {
			if (this.state.mode === 'agent') {
				await this.runAgentLoop(
					llmMessages, selectedModel, config, contextWindow, activeSystemPrompts,
					placeholderAssistant, assistantMessageEl, contentEl,
					targetMessage.references ?? [], signal, settle
				);
			} else {
				await this.options.chatService.streamResponse(
				llmMessages,
				{
					...this.sampling(selectedModel),
					mode: this.state.mode,
					enableRAG: this.state.enableRAG && this.plugin.settings.ragConfig.enabled,
					enableWebSearch: this.state.enableWebSearch && this.plugin.settings.webSearchConfig.enabled,
					activeSystemPrompts,
					conversationId: this.state.currentConversationId ?? undefined,
				},
				{
					onChunk: (chunk: StreamChunk) => {
						if (contentEl && chunk.content) {
							contentEl.appendText(chunk.content);
							this.options.chatContainer.scrollTo({ top: this.options.chatContainer.scrollHeight, behavior: 'smooth' });
						}
					},
					onRAGSources: (sources: RAGSource[]) => { currentRagSources = sources; },
					onComplete: (finalMessage: Message) => settle(true, finalMessage, () => {
						this.replacePlaceholder(placeholderAssistant, finalMessage);
						if (contentEl && finalMessage.content) {
							renderAssistantMarkdown(contentEl, finalMessage.content);
						}
						return assistantMessageEl;
					}, currentRagSources),
					onError: (error: Error) => {
						new Notice(t('chat.notices.chatError', { message: error.message }));
						const failedMessage = errorReply(error, selectedModel, config);
						settle(false, failedMessage, () => {
							this.replacePlaceholder(placeholderAssistant, failedMessage);
							if (contentEl) {
								renderAssistantMarkdown(contentEl, failedMessage.content);
							}
							return assistantMessageEl;
						});
					},
					signal,
				}
				);
			}
		} catch (error) {
			this.finalizeStreamingUI();
			throw error;
		}
		if (settled) return settled;
		this.finalizeStreamingUI();
		return { ok: false, message: placeholderAssistant, element: assistantMessageEl };
	}

	private createLiveTrace(messageEl: HTMLElement, contentEl: HTMLElement | null): () => void {
		const body = this.options.findMessageBodyElement(messageEl);
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
		config: LLMConfig,
		contextWindow: number,
		activeSystemPrompts: Message[],
		placeholderAssistant: Message,
		assistantMessageEl: HTMLElement,
		contentEl: HTMLElement | null,
		references: FileReference[],
		signal: AbortSignal,
		settle: (ok: boolean, message: Message, show: () => HTMLElement, ragSources?: RAGSource[]) => void,
	): Promise<void> {
		const isGenericAgent = !this.plugin.settings.activeAgentId;
		const activeAgent = this.getActiveAgent();

		this.state.agentExecutionSteps = [];
		const trace = new AgentTraceRecorder(this.state.agentExecutionSteps, this.createLiveTrace(assistantMessageEl, contentEl));

		await this.options.chatService.executeAgentLoop(
			llmMessages,
			{
				...this.sampling(selectedModel),
				mode: 'agent',
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
						this.options.chatContainer.scrollTo({ top: this.options.chatContainer.scrollHeight, behavior: 'smooth' });
					}
				},
				onToolCall: (toolName, args, thinking, phase) => trace.call(toolName, args, thinking, phase),
				onToolResult: (_toolName, success, output, phase) => trace.result(success, output, phase),
				onThought: (thought, phase) => trace.thought(thought, phase),
				onComplete: (finalMessage) => settle(true, finalMessage, () => this.showAgentReply(placeholderAssistant, assistantMessageEl, finalMessage), finalMessage.ragSources),
				onError: (error) => {
					new Notice(t('chat.notices.chatError', { message: error.message }));
					const failedMessage = errorReply(error, selectedModel, config);
					settle(false, failedMessage, () => this.showAgentReply(placeholderAssistant, assistantMessageEl, failedMessage));
				},
				signal,
			}
		);
	}

	private showAgentReply(placeholder: Message, placeholderEl: HTMLElement, reply: Message): HTMLElement {
		if (this.state.agentExecutionSteps.length > 0) {
			reply.agentExecutionSteps = [...this.state.agentExecutionSteps];
		}
		this.replacePlaceholder(placeholder, reply);
		placeholderEl.remove();
		return this.options.addMessageToUI(reply);
	}

	private async finishReply(message: Message, show: () => HTMLElement, ragSources?: RAGSource[]): Promise<void> {
		try {
			const messageEl = show();
			if (message.tokenUsage) {
				appendTokenUsageToMessage(messageEl, message.tokenUsage);
			}
			this.options.updateTokenSummary();
			const body = ragSources?.length ? this.options.findMessageBodyElement(messageEl) : null;
			if (body && ragSources) {
				this.options.ragStatusPanel.displaySources(body, ragSources);
			}
			await this.options.conversationManager.saveCurrentConversation();
		} finally {
			this.finalizeStreamingUI();
		}
	}

	private resolveModel(): { selectedModel: string; config: LLMConfig } | null {
		const selectedModel = this.options.getSelectedModel();
		if (!selectedModel) {
			new Notice(t('chat.notices.selectModel'));
			return null;
		}
		const config = this.options.chatService.findLLMConfig(selectedModel);
		if (!config) {
			new Notice(t('chat.notices.noValidProvider'));
			return null;
		}
		return { selectedModel, config };
	}

	private sampling(model: string) {
		const { temperature, maxTokens, topP, frequencyPenalty, presencePenalty } = this.state;
		return { model, temperature, maxTokens, topP, frequencyPenalty, presencePenalty };
	}

	private replacePlaceholder(placeholder: Message, message: Message): void {
		const index = this.state.messages.indexOf(placeholder);
		if (index !== -1) {
			this.state.messages[index] = message;
		} else {
			this.state.messages.push(message);
		}
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
