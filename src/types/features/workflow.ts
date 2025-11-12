/**
 * Workflow Feature Types
 * Types for workflow system
 */

export interface Workflow {
	id: string;
	name: string;
	description?: string;
	nodes: any[];
	edges: any[];
	createdAt: number;
	updatedAt: number;
}

export interface WorkflowExecution {
	id: string;
	workflowId: string;
	status: string;
	startTime: number;
	endTime?: number;
	results?: any;
}
