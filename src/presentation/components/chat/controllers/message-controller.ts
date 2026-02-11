/**
 * Message Controller
 * Manages message display and rendering
 */

import { Notice } from 'obsidian';
import { BaseController } from './base-controller';
import type { Message } from '@/types';
import { renderMessage, type MessageRendererCallbacks } from '@/presentation/components/chat/message-renderer';

export class MessageController extends BaseController {
	private messagesContainer: HTMLElement | null = null;

	async initialize(): Promise<void> {
		// Initialize message controller
	}

	cleanup(): void {
		this.messagesContainer = null;
	}

	/**
	 * Set messages container element
	 */
	setContainer(container: HTMLElement): void {
		this.messagesContainer = container;
	}

	/**
	 * Add a message to the UI
	 */
	addMessageToUI(
		message: Message,
		callbacks: MessageRendererCallbacks
	): HTMLElement {
		if (!this.messagesContainer) {
			throw new Error('Messages container not set');
		}

		const messageEl = renderMessage(
			this.messagesContainer,
			message,
			{
				app: this._app,
				plugin: this._plugin,
				mode: this.state.mode,
				messages: this.state.messages
			},
			callbacks
		);

		// Auto-scroll to bottom
		this.scrollToBottom();

		return messageEl;
	}

	/**
	 * Clear all messages from UI
	 */
	clearMessages(): void {
		if (this.messagesContainer) {
			this.messagesContainer.empty();
		}
	}

	/**
	 * Scroll messages to bottom
	 */
	scrollToBottom(): void {
		if (this.messagesContainer) {
			requestAnimationFrame(() => {
				this.messagesContainer!.scrollTo({
					top: this.messagesContainer!.scrollHeight,
					behavior: 'smooth'
				});
			});
		}
	}

	/**
	 * Get provider avatar emoji
	 */
	getProviderAvatar(provider: string): string {
		const avatars: Record<string, string> = {
			'openai': '🤖',
			'anthropic': '🧠',
			'google': '🔍',
			'ollama': '🦙',
			'deepseek': '🌊',
			'openrouter': '🔀',
			'sap-ai-core': '💼'
		};
		return avatars[provider] || '💬';
	}

	/**
	 * Get provider color
	 */
	getProviderColor(provider: string): string {
		const colors: Record<string, string> = {
			'openai': '#10a37f',
			'anthropic': '#191919',
			'google': '#4285f4',
			'ollama': '#000000',
			'deepseek': '#0066cc',
			'openrouter': '#6366f1',
			'sap-ai-core': '#0070f2'
		};
		return colors[provider] || '#666666';
	}

	/**
	 * Estimate token count from text
	 */
	estimateTokens(text: string): number {
		// Simple estimation: ~4 characters per token
		return Math.ceil(text.length / 4);
	}

	/**
	 * Show notification
	 */
	showNotice(message: string, duration: number = 3000): void {
		new Notice(message, duration);
	}
}
