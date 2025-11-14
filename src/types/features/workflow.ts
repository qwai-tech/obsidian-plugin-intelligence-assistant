/**
 * Workflow Feature Types
 * Types for workflow system
 */

export interface Workflow {
	id: string;
	name: string;
	description?: string;
	nodes: unknown[];
	edges: unknown[];
	createdAt: number;
	updatedAt: number;
}

export interface WorkflowExecution {
	id: string;
	workflowId: string;
	status: string;
	startTime: number;
	endTime?: number;
	results?: unknown;
}
