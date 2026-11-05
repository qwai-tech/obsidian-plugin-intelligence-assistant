/**
 * Conversation Core Types
 * Domain types for conversations and messages
 */

import type { Attachment, FileReference } from '@/features/chat';
import type { RAGSource } from '@/features/knowledge';
import type { WebSearchResult } from '@/features/web-search';
import type { ReasoningStep, AgentExecutionStep } from '@/features/llm';
import type { AgentTaskCheckpoint } from '@/features/agent';

export interface Message {
	role: 'user' | 'assistant' | 'system';
	content: string;
	context?: boolean;
	timestamp?: number;
	model?: string;
	provider?: string;
	providerLabel?: string;
	stopped?: boolean;
	attachments?: Attachment[];
	references?: FileReference[];
	ragSources?: RAGSource[];
	webSearchResults?: WebSearchResult[];
	webSearchProvider?: string;
	reasoningSteps?: ReasoningStep[];
	reasoningContent?: string;
	agentExecutionSteps?: AgentExecutionStep[];
	agentTask?: AgentTaskCheckpoint;
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
