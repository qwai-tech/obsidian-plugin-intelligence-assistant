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

export interface ChatControllerOptions {
	messagesContainer: HTMLElement;
	messageController: MessageController;
	agentController: AgentController;
}

export class ChatController extends BaseController {
	private messagesContainer!: HTMLElement;
	private messageController!: MessageController;
	private agentController!: AgentController;
	private isGenerating: boolean = false;

	// Getters for protected properties
	protected get plugin() {
		return this._plugin;
	}

	protected get app() {
		return this._app;
	}

	async initialize(): Promise<void> {
		// Initialize chat controller
	}

	cleanup(): void {
		this.isGenerating = false;
	}

	/**
	 * Configure controller with dependencies
	 */
	configure(options: ChatControllerOptions): void {
		this.messagesContainer = options.messagesContainer;
		this.messageController = options.messageController;
		this.agentController = options.agentController;
	}

	/**
	 * Send a user message
	 */
	async sendMessage(content: string): Promise<void> {
		if (this.isGenerating) {
			new Notice('Please wait for the current response to complete');
			return;
		}

		if (!content.trim()) {
			return;
		}

		// Create user message
		const userMessage: Message = {
			role: 'user',
			content: content.trim(),
			attachments: this.state.currentAttachments,
			references: this.state.currentReferences // TODO: Fix type definition
		};

		// Add to conversation
		this.state.addMessage(userMessage);

		// Clear input
		this.state.clearAttachments();
		this.state.clearReferences();

		// Generate response
		await this.generateResponse();
	}

	/**
	 * Generate AI response
	 * TODO: Complete MVC refactoring - this is a placeholder
	 */
	generateResponse(): Promise<void> {
		const agent = this.agentController.getCurrentAgent();
		if (!agent) {
			new Notice('No agent selected');
			return;
		}

		this.isGenerating = true;

		try {
			// TODO: Implement proper MVC-based response generation
			// The actual chat implementation is currently in chat-view.ts
			// This controller needs to be properly integrated

			new Notice('Response generation not yet implemented in MVC controller');
			this.isGenerating = false;

		} catch (error: unknown) {
			this.isGenerating = false;
			new Notice(`Failed to generate response: ${safeGetMessage(error)}`);
			console.error('Chat error:', error);
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
