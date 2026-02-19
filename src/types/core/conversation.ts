/**
 * Conversation Core Types
 * Domain types for conversations and messages
 */

import type { Attachment, FileReference } from '../common/attachments';
import type { RAGSource } from '../features/rag';
import type { WebSearchResult } from '../features/web-search';
import type { ReasoningStep, AgentExecutionStep } from '../common/reasoning';

export interface Message {
	role: 'user' | 'assistant' | 'system';
	content: string;
	model?: string;
	attachments?: Attachment[];
	references?: FileReference[];
	ragSources?: RAGSource[];
	webSearchResults?: WebSearchResult[];
	webSearchProvider?: string;
	reasoningSteps?: ReasoningStep[];
	reasoningContent?: string;
	agentExecutionSteps?: AgentExecutionStep[];
	tokenUsage?: {
		promptTokens?: number;
		completionTokens?: number;
		totalTokens?: number;
	};
}

export interface ConversationConfig {
	modelId?: string;
	promptId?: string | null;
	agentId?: string | null;
	cliAgentId?: string | null;
	temperature?: number;
	maxTokens?: number;
	topP?: number;
	frequencyPenalty?: number;
	presencePenalty?: number;
	ragEnabled?: boolean;
	webSearchEnabled?: boolean;
}

export interface Conversation {
	id: string;
	title: string;
	messages: Message[];
	createdAt: number;
	updatedAt: number;
	icon?: string;
	mode?: 'chat' | 'agent';
	config?: ConversationConfig;
}

export interface ConversationSummary {
	conversationId: string;
	summary: string;
	timestamp: number;
	messageCount: number;
}
