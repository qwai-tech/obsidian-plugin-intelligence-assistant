/**
 * Workflow System V2 - Core Type Definitions
 *
 * Simplified and elegant type system for the workflow engine.
 * Reduces complexity while maintaining essential functionality.
 */

import type {
	App,
	MetadataCache,
	RequestUrlParam,
	RequestUrlResponse,
	Vault
} from 'obsidian';
import type { PluginWithSettings } from '@/types/type-utils';
import type { PluginSettings } from '@/types/settings';

/**
 * Node execution data - data passed between nodes
 */
export interface NodeData {
	/** JSON data payload */
	json: Record<string, unknown>;
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
	config: Record<string, unknown>;
}

/**
 * Connection between two nodes
 */
export interface Connection {
	/** Unique identifier */
	id: string;
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
	/** Node type */
	nodeType: string;
	/** Timestamp */
	timestamp: number;
	/** Status */
	status: 'pending' | 'running' | 'completed' | 'error';
	/** Duration in ms (for completed/error) */
	duration?: number;
	/** Error message (for error status) */
	error?: string;
	/** Input data snapshot */
	input?: unknown;
	/** Output data snapshot */
	output?: unknown;
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
	execute: (_input: NodeData[], _config: Record<string, unknown>, _context: ExecutionContext) => Promise<NodeData[]>;
	[key: string]: unknown;
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
  example?: unknown;
}

export interface NodeParameter {
	/** Parameter key */
	name: string;
	/** Display label */
	label: string;
	/** Parameter type */
	type: 'string' | 'number' | 'boolean' | 'select' | 'textarea' | 'code' | 'json';
	/** Default value */
	default: unknown;
	/** Whether required */
	required?: boolean;
	/** Placeholder text */
	placeholder?: string;
	/** Help text */
	description?: string;
	/** Options (for select type) */
	options?: Array<{ label: string; value: unknown }>;
	/** Optional async option loader */
	getOptions?: () => Promise<Array<{ label: string; value: unknown }>>;
	/** Validation function */
	validate?: (_value: unknown) => boolean | string;
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
	log: (_message: string) => void;
	/** Access to app services (Obsidian, AI, etc.) */
	services: WorkflowServices;
}

/**
 * Services available to workflow nodes
 */
export interface WorkflowAIMessage {
	role: string;
	content: string | Record<string, unknown>;
	[key: string]: unknown;
}

export interface WorkflowAIRequestOptions {
	model: string;
	temperature?: number;
	maxTokens?: number;
	stream?: boolean;
	[key: string]: unknown;
}

export interface WorkflowAIResponse {
	content: unknown;
	[key: string]: unknown;
}

export interface WorkflowAIService {
	chat: (_messages: WorkflowAIMessage[], _options: WorkflowAIRequestOptions) => Promise<WorkflowAIResponse>;
	embed?: (_text: string) => Promise<unknown>;
}

export interface WorkflowHttpService {
	request: (_url: string | URL, _options?: RequestUrlParam) => Promise<RequestUrlResponse>;
}

export interface WorkflowServices {
	/** Obsidian app instance (for creating modals, etc.) */
	app?: App;
	/** Obsidian vault access */
	vault?: Vault;
	/** Metadata cache for markdown files */
	metadataCache?: MetadataCache;
	/** Reference to the owning plugin */
	plugin?: PluginWithSettings;
	/** Plugin settings (for accessing configured models, etc.) */
	settings?: PluginSettings;
	/** AI service */
	ai?: WorkflowAIService;
	/** HTTP client */
	http?: WorkflowHttpService;
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
	status: 'pending' | 'running' | 'success' | 'error' | 'completed';
	/** Start time */
	startTime?: number;
	/** End time */
	endTime?: number;
	/** Duration in milliseconds */
	duration?: number;
	/** Error message */
	error?: string;
	/** Input data */
	input?: unknown;
	/** Output data */
	output?: unknown;
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
export interface WorkflowEvents extends Record<string, unknown> {
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
	'execution:view-full': {
		nodeId: string;
		data: {
			input?: unknown;
			output?: unknown;
			metadata?: {
				status?: NodeExecutionState['status'];
				duration?: number;
				startTime?: number;
				endTime?: number;
				error?: string;
			};
		};
	};
}

/**
 * Simple event emitter interface
 */
export interface EventEmitter<T extends Record<string, unknown>> {
	on<K extends keyof T>(_event: K, _handler: (_data: T[K]) => void): void;
	off<K extends keyof T>(_event: K, _handler: (_data: T[K]) => void): void;
	emit<K extends keyof T>(_event: K, _data: T[K]): void;
}
