/**
 * Chat Controller
 * Core chat logic including sending messages and managing conversations
 */

import { Notice } from 'obsidian';
import { BaseController } from './base-controller';
import { MessageController } from './message-controller';
import { AgentController } from './agent-controller';
import { safeGetMessage } from '@/utils/type-guards';
import type { Message, Agent, LLMConfig, ModelInfo } from '@/types';
import type { ChatService } from '@/application/services/chat.service';
import type { StreamChunk } from '@/types/common/llm';

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
	messageController: MessageController;
	agentController: AgentController;
	chatService?: ChatService;
	uiCallbacks?: ChatUICallbacks;
}

export class ChatController extends BaseController {
	private messagesContainer!: HTMLElement;
	private messageController!: MessageController;
	private agentController!: AgentController;
	private chatService: ChatService | null = null;
	private uiCallbacks: ChatUICallbacks | null = null;
	private isGenerating: boolean = false;

	protected get plugin() {
		return this._plugin;
	}

	protected get app() {
		return this._app;
	}

	async initialize(): Promise<void> {}

	cleanup(): void {
		this.isGenerating = false;
	}

	configure(options: ChatControllerOptions): void {
		this.messagesContainer = options.messagesContainer;
		this.messageController = options.messageController;
		this.agentController = options.agentController;
		if (options.chatService) this.chatService = options.chatService;
		if (options.uiCallbacks) this.uiCallbacks = options.uiCallbacks;
	}

	async sendMessage(content: string): Promise<void> {
		if (this.isGenerating) {
			new Notice('Please wait for the current response to complete');
			return;
		}

		if (!content.trim()) return;

		const userMessage: Message = {
			role: 'user',
			content: content.trim(),
			attachments: this.state.currentAttachments,
			references: this.state.currentReferences
		};

		this.state.addMessage(userMessage);
		this.state.clearAttachments();
		this.state.clearReferences();

		await this.generateResponse();
	}

	async generateResponse(): Promise<void> {
		if (!this.chatService) {
			new Notice('ChatService not configured. Using ChatView fallback.');
			this.isGenerating = false;
			return;
		}

		const modelId = this.plugin.settings.defaultModel;
		if (!modelId) {
			new Notice('No model selected');
			this.isGenerating = false;
			return;
		}

		const config = this.chatService.findLLMConfig(modelId);
		if (!config) {
			new Notice('No provider configuration found');
			this.isGenerating = false;
			return;
		}

		this.isGenerating = true;
		const allMessages = this.state.messages;

		try {
			if (this.state.mode === 'agent') {
				await this.chatService.executeAgentLoop(
					allMessages,
					{
						model: modelId,
						mode: 'agent',
						temperature: this.state.temperature,
						maxTokens: this.state.maxTokens,
						enableRAG: this.state.enableRAG,
						enableWebSearch: this.state.enableWebSearch,
						agentId: this.plugin.settings.activeAgentId,
						agents: this.plugin.settings.agents,
						isGenericAgent: !this.plugin.settings.activeAgentId
					},
					{
						onChunk: (chunk) => { this.uiCallbacks?.onChunk(chunk); },
						onToolCall: () => {},
						onToolResult: () => {},
						onThought: () => {},
						onComplete: (msg) => { this.uiCallbacks?.onComplete(msg); },
						onError: (err) => { this.uiCallbacks?.onError(err); },
						checkAbort: () => this.uiCallbacks?.checkAbort?.() ?? false
					}
				);
			} else {
				const contextWindow = 20;
				const llmContent = allMessages[allMessages.length - 1]?.content || '';
				const llmMessages = this.chatService.prepareLlmMessages(allMessages, allMessages[allMessages.length - 1], llmContent, contextWindow);

				await this.chatService.streamResponse(
					llmMessages,
					{
						model: modelId,
						mode: 'chat',
						temperature: this.state.temperature,
						maxTokens: this.state.maxTokens,
						enableRAG: this.state.enableRAG,
						enableWebSearch: this.state.enableWebSearch
					},
					{
						onChunk: (chunk) => { this.uiCallbacks?.onChunk(chunk); },
						onComplete: (msg) => { this.uiCallbacks?.onComplete(msg); },
						onError: (err) => { this.uiCallbacks?.onError(err); },
						onRAGSources: (sources) => { this.uiCallbacks?.onRagSources?.(sources); },
						onWebSearch: (results) => { this.uiCallbacks?.onWebSearch?.(results); },
						checkAbort: () => this.uiCallbacks?.checkAbort?.() ?? false
					}
				);
			}
		} catch (error: unknown) {
			new Notice(`Chat error: ${safeGetMessage(error)}`);
			console.error('Chat error:', error);
		} finally {
			this.isGenerating = false;
		}
	}

	/**
	 * Regenerate last response
	 */
	async regenerateResponse(): Promise<void> {
		const messages = this.state.messages;
		if (messages.length < 2) {
			new Notice('No response to regenerate');
			return;
		}

		// Remove last assistant message
		const updatedMessages = messages.slice(0, -1);
		this.state.messages = updatedMessages;

		// Generate new response
		await this.generateResponse();
	}

	/**
	 * Stop current generation
	 */
	stopGeneration(): void {
		this.isGenerating = false;
		new Notice('Generation stopped');
	}

	/**
	 * Get model configuration for agent
	 */
	private getModelConfig(agent: Agent, currentModel?: string): LLMConfig | null {
		const effectiveModelId = this.getAgentModelId(agent, currentModel);
		const model = this.getModelInfo(effectiveModelId);
		if (!model) return null;

		return this.plugin.settings.llmConfigs.find(
			config => config.provider === model.provider
		) || null;
	}

	/**
	 * Get effective model ID for an agent based on its strategy
	 */
	private getAgentModelId(agent: Agent, currentModel?: string): string {
		switch (agent.modelStrategy.strategy) {
			case 'fixed':
				return agent.modelStrategy.modelId || this.plugin.settings.defaultModel || '';
			case 'chat-view':
				return currentModel || this.plugin.settings.defaultModel || '';
			case 'default':
				return this.plugin.settings.defaultModel || '';
			default:
				return agent.modelStrategy.modelId || this.plugin.settings.defaultModel || '';
		}
	}

	/**
	 * Get model info by ID
	 */
	private getModelInfo(modelId: string): ModelInfo | null {
		for (const config of this.plugin.settings.llmConfigs) {
			const model = config.cachedModels?.find(m => m.id === modelId);
			if (model) return model;
		}
		return null;
	}

	/**
	 * Check if currently generating
	 */
	isCurrentlyGenerating(): boolean {
		return this.isGenerating;
	}
}
