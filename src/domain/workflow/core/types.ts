/**
 * Workflow System V2 - Core Type Definitions
 *
 * Simplified and elegant type system for the workflow engine.
 * Reduces complexity while maintaining essential functionality.
 */

/**
 * Node execution data - data passed between nodes
 */
export interface NodeData {
	/** JSON data payload */
	json: Record<string, any>;
	/** Binary data (files, images, etc.) using Map for better performance */
	binary?: Map<string, Blob>;
}

/**
 * Workflow node - represents a single operation in the workflow
 */
export interface WorkflowNode {
	/** Unique identifier */
	id: string;
	/** Node type (e.g., 'start', 'llm', 'transform') */
	type: string;
	/** Display name */
	name: string;
	/** X coordinate on canvas */
	x: number;
	/** Y coordinate on canvas */
	y: number;
	/** Node configuration parameters */
	config: Record<string, any>;
}

/**
 * Connection between two nodes
 */
export interface Connection {
	/** Source node ID */
	from: string;
	/** Target node ID */
	to: string;
}

/**
 * Complete workflow definition
 */
export interface Workflow {
	/** Unique workflow identifier */
	id: string;
	/** Workflow name */
	name: string;
	/** Description (optional) */
	description?: string;
	/** List of nodes */
	nodes: WorkflowNode[];
	/** List of connections */
	connections: Connection[];
	/** Creation timestamp */
	created: number;
	/** Last update timestamp */
	updated: number;
	/** Tags for organization */
	tags?: string[];
}

/**
 * Workflow execution result
 */
export interface ExecutionResult {
	/** Whether execution succeeded */
	success: boolean;
	/** Execution duration in milliseconds */
	duration: number;
	/** Output data from each node */
	outputs: Map<string, NodeData[]>;
	/** Error message if execution failed */
	error?: string;
	/** Detailed execution log */
	log?: ExecutionLogEntry[];
}

/**
 * Execution log entry
 */
export interface ExecutionLogEntry {
	/** Node ID */
	nodeId: string;
	/** Node name */
	nodeName: string;
	/** Timestamp */
	timestamp: number;
	/** Status */
	status: 'started' | 'completed' | 'error';
	/** Duration in ms (for completed/error) */
	duration?: number;
	/** Error message (for error status) */
	error?: string;
	/** Input data snapshot */
	input?: any;
	/** Output data snapshot */
	output?: any;
}

/**
 * Node definition - describes a node type
 */
export interface NodeIO {
	inputs: DataSpecification[];
	outputs: DataSpecification[];
	multipleInputs?: boolean;
	multipleOutputs?: boolean;
}

export interface NodeDef {
	/** Node type identifier */
	type: string;
	/** Display name */
	name: string;
	/** Icon (emoji) */
	icon: string;
	/** Color (hex) */
	color: string;
	/** Description */
	description: string;
	/** Category for grouping */
	category: NodeCategory;
	/** Whether this node can be a start node */
	canBeStart?: boolean;
	/** Parameter definitions */
	parameters: NodeParameter[];
	/** Input and output specifications */
	io?: NodeIO;
	/** Execute function - processes input data and returns output */
	execute: (input: NodeData[], config: Record<string, any>, context: ExecutionContext) => Promise<NodeData[]>;
	[key: string]: any;
}

/**
 * Node parameter definition
 */
/** 
 * Data type specification for inputs and outputs
 */
export type DataType = 
  | 'string' 
  | 'number' 
  | 'boolean' 
  | 'object' 
  | 'array' 
  | 'json' 
  | 'any'
  | 'file'
  | 'image'
  | 'text'
  | 'html'
  | 'markdown';

export interface DataSpecification {
  /** Data type */
  type: DataType;
  /** Description of the data */
  description: string;
  /** Whether the data is optional */
  optional?: boolean;
  /** Example value for documentation */
  example?: any;
}

export interface NodeParameter {
	/** Parameter key */
	name: string;
	/** Display label */
	label: string;
	/** Parameter type */
	type: 'string' | 'number' | 'boolean' | 'select' | 'textarea' | 'code' | 'json';
	/** Default value */
	default: any;
	/** Whether required */
	required?: boolean;
	/** Placeholder text */
	placeholder?: string;
	/** Help text */
	description?: string;
	/** Options (for select type) */
	options?: Array<{ label: string; value: any }>;
	/** Optional async option loader */
	getOptions?: () => Promise<Array<{ label: string; value: any }>>;
	/** Validation function */
	validate?: (value: any) => boolean | string;
}

/**
 * Node categories for organization
 */
export type NodeCategory = 'trigger' | 'ai' | 'data' | 'logic' | 'tools' | 'memory';

/**
 * Execution context - available to nodes during execution
 */
export interface ExecutionContext {
	/** Workflow being executed */
	workflow: Workflow;
	/** Current execution outputs (for accessing previous node data) */
	outputs: Map<string, NodeData[]>;
	/** Abort signal for cancellation */
	signal?: AbortSignal;
	/** Logger function */
	log: (message: string) => void;
	/** Access to app services (Obsidian, AI, etc.) */
	services: WorkflowServices;
}

/**
 * Services available to workflow nodes
 */
export interface WorkflowServices {
	/** Obsidian app instance (for creating modals, etc.) */
	app?: any;
	/** Obsidian vault access */
	vault: any; // Will be typed as Vault when integrated
	/** AI service */
	ai?: {
		chat: (messages: any[], options?: any) => Promise<string>;
		embed: (text: string) => Promise<number[]>;
	};
	/** HTTP client */
	http?: {
		request: (url: string, options?: any) => Promise<any>;
	};
	/** Plugin settings (for accessing configured models, etc.) */
	settings?: any;
}

/**
 * Workflow execution state (for UI)
 */
export interface ExecutionState {
	/** Whether workflow is currently executing */
	isRunning: boolean;
	/** Currently executing node ID */
	currentNodeId: string | null;
	/** Node states */
	nodeStates: Map<string, NodeExecutionState>;
	/** Execution start time */
	startTime?: number;
}

/**
 * Individual node execution state
 */
export interface NodeExecutionState {
	/** Execution status */
	status: 'pending' | 'running' | 'success' | 'error';
	/** Start time */
	startTime?: number;
	/** End time */
	endTime?: number;
	/** Error message */
	error?: string;
}

/**
 * Canvas interaction state
 */
export interface CanvasState {
	/** Pan offset */
	offset: { x: number; y: number };
	/** Zoom scale */
	scale: number;
	/** Selected node ID */
	selectedNodeId: string | null;
	/** Node being dragged */
	draggingNodeId: string | null;
	/** Connection being created */
	creatingConnection: {
		fromNodeId: string;
		mouseX: number;
		mouseY: number;
	} | null;
}

/**
 * Event types for the workflow system
 */
export interface WorkflowEvents {
	/** Node added */
	'node:added': { node: WorkflowNode };
	/** Node removed */
	'node:removed': { nodeId: string };
	/** Node updated */
	'node:updated': { node: WorkflowNode };
	/** Node selected */
	'node:selected': { nodeId: string | null };
	/** Node edit requested (opens modal) */
	'node:edit': { nodeId: string };
	/** Connection added */
	'connection:added': { connection: Connection };
	/** Connection removed */
	'connection:removed': { connection: Connection };
	/** Workflow saved */
	'workflow:saved': { workflow: Workflow };
	/** Execution started */
	'execution:started': { workflow: Workflow };
	/** Execution completed */
	'execution:completed': { result: ExecutionResult };
	/** Execution error */
	'execution:error': { error: string };
	/** Execution view full data requested */
	'execution:view-full': { nodeId: string; log: { input?: any; output?: any } };
}

/**
 * Simple event emitter interface
 */
export interface EventEmitter<T extends Record<string, any>> {
	on<K extends keyof T>(event: K, handler: (data: T[K]) => void): void;
	off<K extends keyof T>(event: K, handler: (data: T[K]) => void): void;
	emit<K extends keyof T>(event: K, data: T[K]): void;
}
