/**
 * Conversation Domain Model
 * Encapsulates conversation business logic
 */

import type { Conversation, Message } from '@/types/core/conversation';

export class ConversationModel {
	constructor(private data: Conversation) {}

	/**
	 * Add a message to the conversation
	 */
	addMessage(message: Message): void {
		this.data.messages.push(message);
		this.data.updatedAt = Date.now();
	}

	/**
	 * Remove last message
	 */
	removeLastMessage(): Message | undefined {
		const message = this.data.messages.pop();
		if (message) {
			this.data.updatedAt = Date.now();
		}
		return message;
	}

	/**
	 * Get message at index
	 */
	getMessage(index: number): Message | undefined {
		return this.data.messages[index];
	}

	/**
	 * Get all messages
	 */
	getMessages(): Message[] {
		return [...this.data.messages];
	}

	/**
	 * Get user messages
	 */
	getUserMessages(): Message[] {
		return this.data.messages.filter(m => m.role === 'user');
	}

	/**
	 * Get assistant messages
	 */
	getAssistantMessages(): Message[] {
		return this.data.messages.filter(m => m.role === 'assistant');
	}

	/**
	 * Get last message
	 */
	getLastMessage(): Message | undefined {
		return this.data.messages[this.data.messages.length - 1];
	}

	/**
	 * Get last user message
	 */
	getLastUserMessage(): Message | undefined {
		const userMessages = this.getUserMessages();
		return userMessages[userMessages.length - 1];
	}

	/**
	 * Get last assistant message
	 */
	getLastAssistantMessage(): Message | undefined {
		const assistantMessages = this.getAssistantMessages();
		return assistantMessages[assistantMessages.length - 1];
	}

	/**
	 * Count messages
	 */
	getMessageCount(): number {
		return this.data.messages.length;
	}

	/**
	 * Check if conversation is empty
	 */
	isEmpty(): boolean {
		return this.data.messages.length === 0;
	}

	/**
	 * Get total token usage
	 */
	getTotalTokens(): number {
		return this.data.messages.reduce((total, message) => {
			const usage = message.tokenUsage;
			if (!usage) return total;
			return total + (usage.totalTokens || 0);
		}, 0);
	}

	/**
	 * Get prompt tokens
	 */
	getPromptTokens(): number {
		return this.data.messages.reduce((total, message) => {
			const usage = message.tokenUsage;
			if (!usage) return total;
			return total + (usage.promptTokens || 0);
		}, 0);
	}

	/**
	 * Get completion tokens
	 */
	getCompletionTokens(): number {
		return this.data.messages.reduce((total, message) => {
			const usage = message.tokenUsage;
			if (!usage) return total;
			return total + (usage.completionTokens || 0);
		}, 0);
	}

	/**
	 * Get conversation summary
	 */
	getSummary(): string {
		if (this.isEmpty()) return 'Empty conversation';

		const firstUserMessage = this.getUserMessages()[0];
		if (!firstUserMessage) return 'No user messages';

		// Return first 50 characters of first user message
		const content = firstUserMessage.content.substring(0, 50);
		return content + (firstUserMessage.content.length > 50 ? '...' : '');
	}

	/**
	 * Set conversation title
	 */
	setTitle(title: string): void {
		this.data.title = title;
		this.data.updatedAt = Date.now();
	}

	/**
	 * Set conversation icon
	 */
	setIcon(icon: string): void {
		this.data.icon = icon;
		this.data.updatedAt = Date.now();
	}

	/**
	 * Clear all messages
	 */
	clear(): void {
		this.data.messages = [];
		this.data.updatedAt = Date.now();
	}

	/**
	 * Get conversation age in milliseconds
	 */
	getAge(): number {
		return Date.now() - this.data.createdAt;
	}

	/**
	 * Get time since last update in milliseconds
	 */
	getTimeSinceLastUpdate(): number {
		return Date.now() - this.data.updatedAt;
	}

	/**
	 * Check if conversation is old (> 7 days)
	 */
	isOld(): boolean {
		const sevenDays = 7 * 24 * 60 * 60 * 1000;
		return this.getAge() > sevenDays;
	}

	/**
	 * Check if conversation is recent (< 1 hour since last update)
	 */
	isRecent(): boolean {
		const oneHour = 60 * 60 * 1000;
		return this.getTimeSinceLastUpdate() < oneHour;
	}

	/**
	 * Validate conversation
	 */
	validate(): { valid: boolean; errors: string[] } {
		const errors: string[] = [];

		if (!this.data.id || this.data.id.trim() === '') {
			errors.push('Conversation ID is required');
		}

		if (!this.data.title || this.data.title.trim() === '') {
			errors.push('Conversation title is required');
		}

		if (!this.data.createdAt || this.data.createdAt <= 0) {
			errors.push('Invalid creation timestamp');
		}

		if (!this.data.updatedAt || this.data.updatedAt <= 0) {
			errors.push('Invalid update timestamp');
		}

		if (this.data.updatedAt < this.data.createdAt) {
			errors.push('Update timestamp cannot be before creation timestamp');
		}

		return {
			valid: errors.length === 0,
			errors
		};
	}

	/**
	 * Clone conversation
	 */
	clone(): ConversationModel {
		return new ConversationModel(JSON.parse(JSON.stringify(this.data)));
	}

	/**
	 * Export to plain object
	 */
	toJSON(): Conversation {
		return { ...this.data };
	}

	/**
	 * Get raw data
	 */
	getData(): Conversation {
		return this.data;
	}

	/**
	 * Create from plain object
	 */
	static fromJSON(data: Conversation): ConversationModel {
		return new ConversationModel(data);
	}

	/**
	 * Create a new conversation
	 */
	static create(title: string, icon?: string): ConversationModel {
		const conversation: Conversation = {
			id: `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
			title,
			messages: [],
			createdAt: Date.now(),
			updatedAt: Date.now(),
			icon
		};
		return new ConversationModel(conversation);
	}
}
