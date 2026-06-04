import type { App } from 'obsidian';
import type { Message, RAGSource, Agent, FileReference } from '@/types';
import type { StreamChunk, ILLMProvider } from '@/types/common/llm';
import type { AgentExecutionStep } from '@/types/common/reasoning';

import type { RAGManager } from '@/infrastructure/rag-manager';

export const SPAR_PHASES = ['sense', 'plan', 'act', 'reflect', 'final'] as const;
export type SparPhase = typeof SPAR_PHASES[number];

export interface AgentContextSection {
	title: string;
	content: string;
	source: 'active-note' | 'graph-neighbor' | 'reference' | 'rag' | 'memory';
	path?: string;
}

export interface AgentMemorySnapshot {
	agentId: string;
	workingNotes: string[];
	researchLog: string;
	preferences: Record<string, string>;
	updatedAt: number;
}

export interface AgentSenseContext {
	userQuery: string;
	activeFilePath: string | null;
	references: FileReference[];
	sections: AgentContextSection[];
	ragSources: RAGSource[];
	memory: AgentMemorySnapshot | null;
}

export interface AgentLoopCallbacks {
	onChunk: (chunk: StreamChunk) => void;
	onToolCall: (toolName: string, args: Record<string, unknown>, thinking?: string, phase?: SparPhase) => void;
	onToolResult: (toolName: string, success: boolean, output: string, phase?: SparPhase) => void;
	onThought: (thought: string, phase?: SparPhase) => void;
	onComplete: (finalMessage: Message) => void;
	onError: (error: Error) => void;
	onTokenUsage?: (step: number, cumulativeTokens: number, budget: number) => void;
	checkAbort?: () => boolean;
}

export interface AgentLoopOptions {
	model: string;
	mode: 'agent';
	temperature?: number;
	maxTokens?: number;
	topP?: number;
	frequencyPenalty?: number;
	presencePenalty?: number;
	enableRAG?: boolean;
	enableWebSearch?: boolean;
	activeSystemPrompts?: Message[];
	contextWindow?: number;
	conversationId?: string;
	agentId?: string;
	agents?: Agent[];
	isGenericAgent?: boolean;
	references?: FileReference[];
	/**
	 * Structured signal that this task is expected to produce a vault write
	 * proposal (create_note / write_file). When set, the planner uses it instead
	 * of language-dependent prompt string matching to decide whether to force a
	 * write-proposal tool call when the model ends a turn without one.
	 * Leave undefined to fall back to marker detection (legacy behaviour).
	 */
	expectsWriteProposal?: boolean;
}

export type ToolResultEntry = { role: 'tool'; content: string; tool_call_id: string };

export type AssistantWithCalls = Message & {
	tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
	reasoning_content?: string;
};

export type AgentWorkingMessage = Message | ToolResultEntry | AssistantWithCalls;

export interface AgentLoopDependencies {
	app: App;
	createProvider: (modelId: string) => { provider: ILLMProvider; providerId: string } | null;
	ragManager?: RAGManager;
	recordUsage?: (record: {
		model: string;
		provider: string;
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
		timestamp: number;
		conversationId?: string;
	}) => Promise<void>;
}

export interface AgentLoopResult {
	message: Message;
	steps: AgentExecutionStep[];
	sense: AgentSenseContext;
}
