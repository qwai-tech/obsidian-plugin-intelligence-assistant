/**
 * Workflow System V2 - Debugging Service
 *
 * Provides debugging capabilities for workflow execution including
 * single-node execution, breakpoints, and step-by-step execution.
 */

import { isRecord } from '@/types/type-utils';
import {
  WorkflowNode,
  NodeData,
  WorkflowServices,
  ExecutionContext,
  ExecutionLogEntry,
  NodeExecutionState
} from '../core/types';
import { WorkflowGraph } from '../core/workflow';
import { NodeRegistry } from '../nodes/registry';

export interface DebugSession {
  id: string;
  workflowId: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  currentNodeId: string | null;
  stepNumber: number;
  nodeStates: Map<string, NodeExecutionState>;
  nodeInputs: Map<string, NodeData[]>;
  nodeOutputs: Map<string, NodeData[]>;
  log: ExecutionLogEntry[];
  startTime?: number;
  endTime?: number;
}

export interface DebugOptions {
  /** Whether to enable breakpoints */
  enableBreakpoints?: boolean;
  /** Nodes that should act as breakpoints */
  breakpoints?: string[];
  /** Whether to pause after each node execution */
  stepByStep?: boolean;
}

export class DebugService {
  private sessions = new Map<string, DebugSession>();
  private nodeRegistry: NodeRegistry;
  
  constructor(nodeRegistry: NodeRegistry) {
    this.nodeRegistry = nodeRegistry;
  }

  /**
   * Start a new debug session
   */
  startSession(
    workflow: WorkflowGraph, 
    services: WorkflowServices, 
    _options: DebugOptions = {}
  ): string {
    const sessionId = `debug_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    
    const session: DebugSession = {
      id: sessionId,
      workflowId: workflow.getData().id,
      status: 'idle',
      currentNodeId: null,
      stepNumber: 0,
      nodeStates: new Map(),
      nodeInputs: new Map(),
      nodeOutputs: new Map(),
      log: [],
      startTime: Date.now(),
    };

    this.sessions.set(sessionId, session);

    // Initialize node states
    for (const node of workflow.getNodes()) {
      session.nodeStates.set(node.id, {
        status: 'pending',
        startTime: 0
      });
    }

    session.status = 'running';
    return sessionId;
  }

  /**
   * Execute a single node in debug mode
   */
  async executeNode(
    sessionId: string, 
    nodeId: string, 
    workflow: WorkflowGraph, 
    services: WorkflowServices
  ): Promise<{ success: boolean; output?: NodeData[]; error?: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Debug session ${sessionId} not found`);
    }

    const node = workflow.getNode(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found in workflow`);
    }

    const nodeDef = this.nodeRegistry.get(node.type);
    if (!nodeDef) {
      throw new Error(`Node definition for ${node.type} not found`);
    }

    // Update node state to running
    const startTime = Date.now();
    session.nodeStates.set(nodeId, {
      status: 'running',
      startTime
    });
    session.currentNodeId = nodeId;

    // Log start
    const logEntry: ExecutionLogEntry = {
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      timestamp: startTime,
      status: 'running',
    };
    session.log.push(logEntry);

    try {
      // Get input data from previous nodes
      const inputs = this.getNodeInputs(nodeId, workflow, session);
      
      // Store inputs
      session.nodeInputs.set(nodeId, inputs);

      // Create execution context
      const context: ExecutionContext = {
        workflow: workflow.getData(),
        outputs: session.nodeOutputs, // Use debug session's output map
        signal: undefined, // No abort signal in debug mode
        log: (message: string) => {
          console.debug(`[DEBUG: ${node.name}] ${message}`);
        },
        services,
      };

      // Execute node
      const result = await nodeDef.execute(inputs, node.config, context);

      // Store outputs
      session.nodeOutputs.set(nodeId, result);

      // Update node state to success
      const endTime = Date.now();
      session.nodeStates.set(nodeId, {
        status: 'success',
        startTime,
        endTime
      });

      // Log completion
      const completionLog: ExecutionLogEntry = {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        timestamp: endTime,
        status: 'completed',
        duration: endTime - startTime,
        input: inputs.length > 0 ? inputs[0].json : undefined,
        output: result.length > 0 ? result[0].json : undefined,
      };
      session.log.push(completionLog);

      session.stepNumber++;
      
      return { success: true, output: result };
    } catch (error: unknown) {
      // Update node state to error
      const endTime = Date.now();
      const errorMessage = error instanceof Error ? error.message : String(error);
      session.nodeStates.set(nodeId, {
        status: 'error',
        startTime,
        endTime,
        error: errorMessage
      });

      // Log error
      const errorLog: ExecutionLogEntry = {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        timestamp: endTime,
        status: 'error',
        duration: endTime - startTime,
        error: errorMessage,
      };
      session.log.push(errorLog);

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Execute workflow step by step
   */
  async executeStep(
    sessionId: string, 
    workflow: WorkflowGraph, 
    services: WorkflowServices
  ): Promise<{ completed: boolean; nextNodeId?: string; output?: NodeData[]; error?: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Debug session ${sessionId} not found`);
    }

    const executionOrder = workflow.getExecutionOrder();
    if (!executionOrder) {
      throw new Error('Workflow has circular dependencies');
    }

    // Find the next node to execute
    let nextNodeId: string | undefined;
    for (const nodeId of executionOrder) {
      const nodeState = session.nodeStates.get(nodeId);
      if (nodeState?.status === 'pending') {
        nextNodeId = nodeId;
        break;
      }
    }

    if (!nextNodeId) {
      // All nodes executed
      session.status = 'completed';
      session.endTime = Date.now();
      return { completed: true };
    }

    // Execute the next node
    const result = await this.executeNode(sessionId, nextNodeId, workflow, services);
    
    if (!result.success) {
      session.status = 'error';
      session.endTime = Date.now();
      return { completed: true, error: result.error };
    }

    return { 
      completed: false, 
      nextNodeId, 
      output: result.output 
    };
  }

  /**
   * Execute entire workflow in debug mode
   */
  async executeWorkflow(
    sessionId: string, 
    workflow: WorkflowGraph, 
    services: WorkflowServices,
    options: DebugOptions = {}
  ): Promise<{ success: boolean; error?: string; log: ExecutionLogEntry[] }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Debug session ${sessionId} not found`);
    }

    session.status = 'running';

    try {
      const executionOrder = workflow.getExecutionOrder();
      if (!executionOrder) {
        throw new Error('Workflow has circular dependencies');
      }

      for (const nodeId of executionOrder) {
        // Check if we should pause (breakpoint or step-by-step)
        if (options.stepByStep || (options.breakpoints && options.breakpoints.includes(nodeId))) {
          await this.pauseAtNode(sessionId, nodeId);
        }

        const result = await this.executeNode(sessionId, nodeId, workflow, services);
        if (!result.success) {
          return { success: false, error: result.error, log: session.log };
        }
      }

      session.status = 'completed';
      session.endTime = Date.now();
      return { success: true, log: session.log };
    } catch (error: unknown) {
      session.status = 'error';
      session.endTime = Date.now();
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage, log: session.log };
    }
  }

  /**
   * Pause execution at a specific node
   */
  private async pauseAtNode(sessionId: string, nodeId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'paused';
    session.currentNodeId = nodeId;
    
    // In a real implementation, we would wait for resume command
    // For now, we'll just simulate the pause behavior
    return new Promise(resolve => setTimeout(resolve, 0)); // Immediate resolve for now
  }

  /**
   * Resume execution from pause
   */
  resume(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'paused') {
      throw new Error('Session is not paused');
    }

    session.status = 'running';
  }

  /**
   * Abort current execution
   */
  abort(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'idle';
    session.currentNodeId = null;
  }

  /**
   * Get debug session by ID
   */
  getSession(sessionId: string): DebugSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get node inputs for debugging
   */
  private getNodeInputs(nodeId: string, workflow: WorkflowGraph, session: DebugSession): NodeData[] {
    const previousNodes = workflow.getPreviousNodes(nodeId);

    // If no previous nodes, return empty input
    if (previousNodes.length === 0) {
      return [{ json: {} }];
    }

    // Collect outputs from all previous nodes using the debug session's output cache
    const inputs: NodeData[] = [];
    for (const prevNode of previousNodes) {
      const output = session.nodeOutputs.get(prevNode.id);
      if (output) {
        inputs.push(...output);
      }
    }

    // Return inputs or empty input if none
    return inputs.length > 0 ? inputs : [{ json: {} }];
  }

  /**
   * Get node execution details for a specific node in a session
   */
  getNodeDetails(sessionId: string, nodeId: string): {
    input?: NodeData[];
    output?: NodeData[];
    state?: NodeExecutionState;
    log: ExecutionLogEntry[];
  } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { log: [] };
    }

    const input = session.nodeInputs.get(nodeId);
    const output = session.nodeOutputs.get(nodeId);
    const state = session.nodeStates.get(nodeId);
    const log = session.log.filter(e => e.nodeId === nodeId);

    return { input, output, state, log };
  }

  /**
   * Clear a debug session
   */
  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Clear all debug sessions
   */
  clearAllSessions(): void {
    this.sessions.clear();
  }

  /**
   * Execute a single node (convenience method)
   */
  async executeSingleNode(
    node: WorkflowNode, 
    workflow: WorkflowGraph, 
    services: WorkflowServices,
    contextData?: unknown
  ): Promise<{ success: boolean; output?: NodeData[]; error?: string }> {
    // Create a temporary debug session for single node execution
    const sessionId = this.startSession(workflow, services);
    
    // Create a context with provided input data
    if (contextData) {
      const json = isRecord(contextData) ? contextData : { data: contextData };
      this.sessions.get(sessionId)?.nodeInputs.set(node.id, [{ json }]);
    }

    const result = await this.executeNode(sessionId, node.id, workflow, services);
    
    // Clean up the temporary session
    this.clearSession(sessionId);
    
    return result;
  }
}
