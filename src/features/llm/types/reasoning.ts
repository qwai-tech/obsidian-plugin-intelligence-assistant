/**
 * Reasoning Common Types
 * Shared types for reasoning and agent execution
 */

export interface ReasoningStep {
	step: number;
	description: string;
	content: string;
	timestamp?: number;
}

export interface AgentExecutionStep {
	type: 'thought' | 'action' | 'observation' | 'response';
	content: string;
	timestamp: number;
	status?: 'pending' | 'success' | 'error';
	phase?: 'sense' | 'plan' | 'act' | 'reflect' | 'final';
	/** Structured tool name (for action steps) */
	toolName?: string;
	/** Structured args (for action steps) */
	args?: Record<string, unknown>;
	/** Tool result string (for action steps — replaces separate observation) */
	result?: string;
	/** Reasoning text that preceded this tool call */
	thinking?: string;
}
