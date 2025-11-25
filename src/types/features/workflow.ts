import { Connection, WorkflowNode } from '@/domain/workflow/core/types';

/**
 * Workflow Feature Types
 * Types for workflow system
 */

export interface Workflow {
	id: string;
	name: string;
	description?: string;
	nodes: WorkflowNode[];
	edges: Connection[];
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
