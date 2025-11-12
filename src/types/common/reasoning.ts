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
	type: 'thought' | 'action' | 'observation';
	content: string;
	timestamp: number;
	status?: 'pending' | 'success' | 'error';
}
