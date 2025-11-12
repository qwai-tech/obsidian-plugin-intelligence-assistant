/**
 * ChatView State Management
 * Centralized state container for chat view data and configuration
 */

import type { Message, Attachment, ModelInfo } from '@/types';
import { TFile, TFolder } from 'obsidian';
import { Events } from 'obsidian';

export interface StateChangeEvent {
	field: string;
	oldValue: any;
	newValue: any;
}

export interface AgentExecutionStep {
	type: 'thought' | 'action' | 'observation';
	content: string;
	timestamp: number;
	status?: 'pending' | 'success' | 'error';
}

/**
 * Manages all state for ChatView
 * Emits events when state changes to allow reactive updates
 */
export class ChatViewState extends Events {
	// Conversation data
	private _messages: Message[] = [];
	private _currentConversationId: string | null = null;
	private _availableModels: ModelInfo[] = [];

	// Configuration
	private _temperature: number = 0.7;
	private _maxTokens: number = 4000;
	private _mode: 'chat' | 'agent' = 'chat';

	// Feature flags
	private _enableRAG: boolean = false;
	private _enableWebSearch: boolean = false;

	// UI state
	private _conversationListVisible: boolean = false;
	private _conversationListPinned: boolean = false;

	// Attachments
	private _currentAttachments: Attachment[] = [];
	private _referencedFiles: (TFile | TFolder)[] = [];

	// Streaming state
	private _isStreaming: boolean = false;
	private _stopStreamingRequested: boolean = false;

	// Agent execution
	private _agentExecutionSteps: AgentExecutionStep[] = [];

	// Messages
	get messages(): Message[] {
		return this._messages;
	}

	set messages(value: Message[]) {
		const oldValue = this._messages;
		this._messages = value;
		this.trigger('state-change', { field: 'messages', oldValue, newValue: value });
	}

	addMessage(message: Message): void {
		this._messages.push(message);
		this.trigger('state-change', {
			field: 'messages',
			oldValue: this._messages.slice(0, -1),
			newValue: this._messages
		});
	}

	clearMessages(): void {
		const oldValue = this._messages;
		this._messages = [];
		this.trigger('state-change', { field: 'messages', oldValue, newValue: [] });
	}

	// Current conversation
	get currentConversationId(): string | null {
		return this._currentConversationId;
	}

	set currentConversationId(value: string | null) {
		const oldValue = this._currentConversationId;
		this._currentConversationId = value;
		this.trigger('state-change', { field: 'currentConversationId', oldValue, newValue: value });
	}

	// Available models
	get availableModels(): ModelInfo[] {
		return this._availableModels;
	}

	set availableModels(value: ModelInfo[]) {
		const oldValue = this._availableModels;
		this._availableModels = value;
		this.trigger('state-change', { field: 'availableModels', oldValue, newValue: value });
	}

	// Temperature
	get temperature(): number {
		return this._temperature;
	}

	set temperature(value: number) {
		const oldValue = this._temperature;
		this._temperature = value;
		this.trigger('state-change', { field: 'temperature', oldValue, newValue: value });
	}

	// Max tokens
	get maxTokens(): number {
		return this._maxTokens;
	}

	set maxTokens(value: number) {
		const oldValue = this._maxTokens;
		this._maxTokens = value;
		this.trigger('state-change', { field: 'maxTokens', oldValue, newValue: value });
	}

	// Mode
	get mode(): 'chat' | 'agent' {
		return this._mode;
	}

	set mode(value: 'chat' | 'agent') {
		const oldValue = this._mode;
		this._mode = value;
		this.trigger('state-change', { field: 'mode', oldValue, newValue: value });
	}

	// RAG enabled
	get enableRAG(): boolean {
		return this._enableRAG;
	}

	set enableRAG(value: boolean) {
		const oldValue = this._enableRAG;
		this._enableRAG = value;
		this.trigger('state-change', { field: 'enableRAG', oldValue, newValue: value });
	}

	// Web search enabled
	get enableWebSearch(): boolean {
		return this._enableWebSearch;
	}

	set enableWebSearch(value: boolean) {
		const oldValue = this._enableWebSearch;
		this._enableWebSearch = value;
		this.trigger('state-change', { field: 'enableWebSearch', oldValue, newValue: value });
	}

	// Conversation list visibility
	get conversationListVisible(): boolean {
		return this._conversationListVisible;
	}

	set conversationListVisible(value: boolean) {
		const oldValue = this._conversationListVisible;
		this._conversationListVisible = value;
		this.trigger('state-change', { field: 'conversationListVisible', oldValue, newValue: value });
	}

	// Conversation list pinned
	get conversationListPinned(): boolean {
		return this._conversationListPinned;
	}

	set conversationListPinned(value: boolean) {
		const oldValue = this._conversationListPinned;
		this._conversationListPinned = value;
		this.trigger('state-change', { field: 'conversationListPinned', oldValue, newValue: value });
	}

	// Current attachments
	get currentAttachments(): Attachment[] {
		return this._currentAttachments;
	}

	set currentAttachments(value: Attachment[]) {
		const oldValue = this._currentAttachments;
		this._currentAttachments = value;
		this.trigger('state-change', { field: 'currentAttachments', oldValue, newValue: value });
	}

	addAttachment(attachment: Attachment): void {
		this._currentAttachments.push(attachment);
		this.trigger('state-change', {
			field: 'currentAttachments',
			oldValue: this._currentAttachments.slice(0, -1),
			newValue: this._currentAttachments
		});
	}

	removeAttachment(index: number): void {
		const oldValue = [...this._currentAttachments];
		this._currentAttachments.splice(index, 1);
		this.trigger('state-change', {
			field: 'currentAttachments',
			oldValue,
			newValue: this._currentAttachments
		});
	}

	clearAttachments(): void {
		const oldValue = this._currentAttachments;
		this._currentAttachments = [];
		this.trigger('state-change', { field: 'currentAttachments', oldValue, newValue: [] });
	}

	// Current references (for compatibility)
	get currentReferences(): any[] {
		return this._referencedFiles.map(file => ({
			type: 'path' in file ? 'file' : 'folder',
			path: file.path,
			name: file.name
		}));
	}

	clearReferences(): void {
		const oldValue = this._referencedFiles;
		this._referencedFiles = [];
		this.trigger('state-change', { field: 'referencedFiles', oldValue, newValue: [] });
	}

	// Referenced files
	get referencedFiles(): (TFile | TFolder)[] {
		return this._referencedFiles;
	}

	set referencedFiles(value: (TFile | TFolder)[]) {
		const oldValue = this._referencedFiles;
		this._referencedFiles = value;
		this.trigger('state-change', { field: 'referencedFiles', oldValue, newValue: value });
	}

	addReferencedFile(file: TFile | TFolder): void {
		this._referencedFiles.push(file);
		this.trigger('state-change', {
			field: 'referencedFiles',
			oldValue: this._referencedFiles.slice(0, -1),
			newValue: this._referencedFiles
		});
	}

	removeReferencedFile(index: number): void {
		const oldValue = [...this._referencedFiles];
		this._referencedFiles.splice(index, 1);
		this.trigger('state-change', {
			field: 'referencedFiles',
			oldValue,
			newValue: this._referencedFiles
		});
	}

	clearReferencedFiles(): void {
		const oldValue = this._referencedFiles;
		this._referencedFiles = [];
		this.trigger('state-change', { field: 'referencedFiles', oldValue, newValue: [] });
	}

	// Streaming state
	get isStreaming(): boolean {
		return this._isStreaming;
	}

	set isStreaming(value: boolean) {
		const oldValue = this._isStreaming;
		this._isStreaming = value;
		this.trigger('state-change', { field: 'isStreaming', oldValue, newValue: value });
	}

	get stopStreamingRequested(): boolean {
		return this._stopStreamingRequested;
	}

	set stopStreamingRequested(value: boolean) {
		const oldValue = this._stopStreamingRequested;
		this._stopStreamingRequested = value;
		this.trigger('state-change', { field: 'stopStreamingRequested', oldValue, newValue: value });
	}

	// Agent execution steps
	get agentExecutionSteps(): AgentExecutionStep[] {
		return this._agentExecutionSteps;
	}

	set agentExecutionSteps(value: AgentExecutionStep[]) {
		const oldValue = this._agentExecutionSteps;
		this._agentExecutionSteps = value;
		this.trigger('state-change', { field: 'agentExecutionSteps', oldValue, newValue: value });
	}

	addAgentExecutionStep(step: AgentExecutionStep): void {
		this._agentExecutionSteps.push(step);
		this.trigger('state-change', {
			field: 'agentExecutionSteps',
			oldValue: this._agentExecutionSteps.slice(0, -1),
			newValue: this._agentExecutionSteps
		});
	}

	clearAgentExecutionSteps(): void {
		const oldValue = this._agentExecutionSteps;
		this._agentExecutionSteps = [];
		this.trigger('state-change', { field: 'agentExecutionSteps', oldValue, newValue: [] });
	}

	/**
	 * Reset all state to defaults
	 */
	reset(): void {
		this.clearMessages();
		this.currentConversationId = null;
		this.availableModels = [];
		this.temperature = 0.7;
		this.maxTokens = 4000;
		this.mode = 'chat';
		this.enableRAG = false;
		this.enableWebSearch = false;
		this.conversationListVisible = false;
		this.conversationListPinned = false;
		this.clearAttachments();
		this.clearReferencedFiles();
		this.isStreaming = false;
		this.stopStreamingRequested = false;
		this.clearAgentExecutionSteps();
	}

	/**
	 * Get a snapshot of current state for debugging
	 */
	getSnapshot(): Record<string, any> {
		return {
			messagesCount: this._messages.length,
			currentConversationId: this._currentConversationId,
			availableModelsCount: this._availableModels.length,
			temperature: this._temperature,
			maxTokens: this._maxTokens,
			mode: this._mode,
			enableRAG: this._enableRAG,
			enableWebSearch: this._enableWebSearch,
			conversationListVisible: this._conversationListVisible,
			conversationListPinned: this._conversationListPinned,
			currentAttachmentsCount: this._currentAttachments.length,
			referencedFilesCount: this._referencedFiles.length,
			isStreaming: this._isStreaming,
			stopStreamingRequested: this._stopStreamingRequested,
			agentExecutionStepsCount: this._agentExecutionSteps.length
		};
	}
}
