/**
 * Workflow System V2 - Execution Engine
 *
 * High-performance workflow executor with progress tracking and error handling.
 * Simplified implementation focusing on reliability and speed.
 */

import {
	WorkflowNode,
	NodeData,
	ExecutionResult,
	ExecutionContext,
	ExecutionLogEntry,
	NodeExecutionState,
	WorkflowServices
} from './types';
import { WorkflowGraph } from './workflow';
import { NodeRegistry } from '../nodes/registry';
import { ExecutionHistoryService } from '../services/execution-history';
import { ErrorHandler, WorkflowError, WorkflowErrorType } from '../services/error-handler';

/**
 * Workflow executor - executes workflows
 */
export class WorkflowExecutor {
	private nodeRegistry: NodeRegistry;
	private abortController: AbortController | null = null;
	private executionState: Map<string, NodeExecutionState> = new Map();
	private outputs: Map<string, NodeData[]> = new Map();
	private log: ExecutionLogEntry[] = [];

	constructor(nodeRegistry: NodeRegistry) {
		this.nodeRegistry = nodeRegistry;
	}

	/**
	 * Execute a workflow
	 */
	async execute(
		workflow: WorkflowGraph,
		services: WorkflowServices,
		onProgress?: (nodeId: string, state: NodeExecutionState) => void
	): Promise<ExecutionResult> {
		const startTime = Date.now();

		// Reset state
		this.abortController = new AbortController();
		this.executionState.clear();
		this.outputs.clear();
		this.log = [];

		try {
			// Validate workflow
			const errors = workflow.validate();
			if (errors.length > 0) {
				throw new Error(`工作流验证失败:\n${errors.join('\n')}`);
			}

			// Get execution order
			const order = workflow.getExecutionOrder();
			if (!order) {
				throw new Error('工作流包含循环依赖');
			}

			// Execute nodes in order
			for (const nodeId of order) {
				// Check if aborted
				if (this.abortController.signal.aborted) {
					throw new Error('执行已取消');
				}

				const node = workflow.getNode(nodeId);
				if (!node) continue;

				await this.executeNode(node, workflow, services, onProgress);
			}

			// Success
			return {
				success: true,
				duration: Date.now() - startTime,
				outputs: this.outputs,
				log: this.log,
			};

		} catch (error: any) {
			// Error
			return {
				success: false,
				duration: Date.now() - startTime,
				outputs: this.outputs,
				error: error.message,
				log: this.log,
			};
		} finally {
			this.abortController = null;
		}
	}

	/**
	 * Execute a single node
	 */
	private async executeNode(
		node: WorkflowNode,
		workflow: WorkflowGraph,
		services: WorkflowServices,
		onProgress?: (nodeId: string, state: NodeExecutionState) => void
	): Promise<void> {
		const startTime = Date.now();

		// Update state to running
		const state: NodeExecutionState = {
			status: 'running',
			startTime,
		};
		this.executionState.set(node.id, state);
		onProgress?.(node.id, state);

		// Log start
		this.log.push({
			nodeId: node.id,
			nodeName: node.name,
			timestamp: startTime,
			status: 'started',
		});

		try {
			// Get node definition
			const nodeDef = this.nodeRegistry.get(node.type);
			if (!nodeDef) {
				throw new Error(`未知节点类型: ${node.type}`);
			}

			// Get input data from previous nodes
			const inputs = this.getNodeInputs(node.id, workflow);

			// Create execution context
			const context: ExecutionContext = {
				workflow: workflow.getData(),
				outputs: this.outputs,
				signal: this.abortController?.signal,
				log: (message: string) => {
					console.log(`[${node.name}] ${message}`);
				},
				services,
			};

			// Execute node
			const result = await nodeDef.execute(inputs, node.config, context);

			// Store outputs
			this.outputs.set(node.id, result);

			// Update state to success
			const endTime = Date.now();
			const successState: NodeExecutionState = {
				status: 'success',
				startTime,
				endTime,
			};
			this.executionState.set(node.id, successState);
			onProgress?.(node.id, successState);

			// Log completion
			this.log.push({
				nodeId: node.id,
				nodeName: node.name,
				timestamp: endTime,
				status: 'completed',
				duration: endTime - startTime,
				input: inputs.length > 0 ? inputs[0].json : undefined,
				output: result.length > 0 ? result[0].json : undefined,
			});

		} catch (error: any) {
			// Update state to error
			const endTime = Date.now();
			const errorState: NodeExecutionState = {
				status: 'error',
				startTime,
				endTime,
				error: error.message,
			};
			this.executionState.set(node.id, errorState);
			onProgress?.(node.id, errorState);

			// Log error
			this.log.push({
				nodeId: node.id,
				nodeName: node.name,
				timestamp: endTime,
				status: 'error',
				duration: endTime - startTime,
				error: error.message,
			});

			// Re-throw to stop execution
			throw error;
		}
	}

	/**
	 * Get input data for a node
	 */
	private getNodeInputs(nodeId: string, workflow: WorkflowGraph): NodeData[] {
		const previousNodes = workflow.getPreviousNodes(nodeId);

		// If no previous nodes, return empty input
		if (previousNodes.length === 0) {
			return [{ json: {} }];
		}

		// Collect outputs from all previous nodes
		const inputs: NodeData[] = [];
		for (const prevNode of previousNodes) {
			const output = this.outputs.get(prevNode.id);
			if (output) {
				inputs.push(...output);
			}
		}

		// Return inputs or empty input if none
		return inputs.length > 0 ? inputs : [{ json: {} }];
	}

	/**
	 * Abort current execution
	 */
	abort(): void {
		this.abortController?.abort();
	}

	/**
	 * Get current execution state
	 */
	getExecutionState(): Map<string, NodeExecutionState> {
		return new Map(this.executionState);
	}

	/**
	 * Get execution log
	 */
	getExecutionLog(): ExecutionLogEntry[] {
		return [...this.log];
	}
}
