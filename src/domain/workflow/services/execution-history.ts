/**
 * Workflow System V2 - Execution History Service
 *
 * Manages execution history with detailed logs, input/output tracking,
 * and historical execution data for debugging and analysis.
 */

import { ExecutionResult, Workflow, WorkflowNode, NodeData, ExecutionLogEntry } from '../core/types';

export interface ExecutionHistoryEntry {
  id: string;
  workflowId: string;
  workflowName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  result?: ExecutionResult;
  nodeInputs: Map<string, NodeData[]>;
  nodeOutputs: Map<string, NodeData[]>;
}

export class ExecutionHistoryService {
  private history: ExecutionHistoryEntry[] = [];
  private maxHistorySize = 100; // Keep last 100 executions

  /**
   * Record a new execution
   */
  recordExecution(workflow: Workflow, result: ExecutionResult): string {
    const entryId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const entry: ExecutionHistoryEntry = {
      id: entryId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      startTime: Date.now(), // Will be overridden with actual execution start time
      endTime: Date.now(),
      duration: result.duration,
      status: result.success ? 'completed' : 'failed',
      result,
      nodeInputs: new Map(), // Will populate when available in execution context
      nodeOutputs: new Map(),
    };

    // Store in history
    this.history.unshift(entry);
    
    // Limit history size
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(0, this.maxHistorySize);
    }

    return entryId;
  }

  /**
   * Add execution log to an existing entry
   */
  addExecutionLog(executionId: string, logEntry: ExecutionLogEntry): void {
    const execution = this.history.find(e => e.id === executionId);
    if (!execution) return;

    if (execution.result && execution.result.log) {
      execution.result.log.push(logEntry);
    }
  }

  /**
   * Add node input/output data to an execution
   */
  addNodeData(executionId: string, nodeId: string, input?: NodeData[], output?: NodeData[]): void {
    const execution = this.history.find(e => e.id === executionId);
    if (!execution) return;

    if (input) {
      execution.nodeInputs.set(nodeId, input);
    }
    if (output) {
      execution.nodeOutputs.set(nodeId, output);
    }
  }

  /**
   * Get execution by ID
   */
  getExecution(id: string): ExecutionHistoryEntry | undefined {
    return this.history.find(e => e.id === id);
  }

  /**
   * Get executions for a specific workflow
   */
  getExecutionsByWorkflow(workflowId: string): ExecutionHistoryEntry[] {
    return this.history.filter(e => e.workflowId === workflowId);
  }

  /**
   * Get all executions with optional filters
   */
  getExecutions(options?: {
    status?: ('running' | 'completed' | 'failed' | 'aborted')[];
    limit?: number;
    offset?: number;
  }): ExecutionHistoryEntry[] {
    let results = this.history;

    if (options?.status) {
      results = results.filter(e => options.status?.includes(e.status));
    }

    if (options?.offset) {
      results = results.slice(options.offset);
    }

    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Get execution statistics
   */
  getStats(workflowId?: string): {
    total: number;
    successful: number;
    failed: number;
    averageDuration: number;
  } {
    const executions = workflowId 
      ? this.history.filter(e => e.workflowId === workflowId)
      : this.history;

    const total = executions.length;
    const successful = executions.filter(e => e.status === 'completed').length;
    const failed = executions.filter(e => e.status === 'failed').length;
    const averageDuration = total > 0 
      ? executions.reduce((sum, e) => sum + (e.duration || 0), 0) / total 
      : 0;

    return {
      total,
      successful,
      failed,
      averageDuration
    };
  }

  /**
   * Clear execution history (with optional workflow filter)
   */
  clearHistory(workflowId?: string): void {
    if (workflowId) {
      this.history = this.history.filter(e => e.workflowId !== workflowId);
    } else {
      this.history = [];
    }
  }

  /**
   * Get latest execution for a workflow
   */
  getLatestExecution(workflowId: string): ExecutionHistoryEntry | undefined {
    return this.history.find(e => e.workflowId === workflowId);
  }

  /**
   * Get node execution details for a specific execution
   */
  getNodeExecutionDetails(executionId: string, nodeId: string): {
    inputs: NodeData[];
    outputs: NodeData[];
    log: ExecutionLogEntry[];
  } {
    const execution = this.getExecution(executionId);
    
    if (!execution) {
      return { inputs: [], outputs: [], log: [] };
    }

    const inputs = execution.nodeInputs.get(nodeId) || [];
    const outputs = execution.nodeOutputs.get(nodeId) || [];
    const log = execution.result?.log?.filter(e => e.nodeId === nodeId) || [];

    return { inputs, outputs, log };
  }
}
