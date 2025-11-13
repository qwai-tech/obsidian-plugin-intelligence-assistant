/**
 * Workflow System V2 - Main Entry Point
 *
 * Exports all public APIs for the workflow system.
 * This is the only file that should be imported by external code.
 */

// Core types
export type {
	NodeData,
	WorkflowNode,
	Connection,
	Workflow,
	ExecutionResult,
	ExecutionLogEntry,
	NodeDef,
	NodeParameter,
	NodeCategory,
	ExecutionContext,
	WorkflowServices,
	ExecutionState,
	NodeExecutionState,
	CanvasState,
	WorkflowEvents,
	EventEmitter,
} from './core/types';

// Core classes
export { WorkflowGraph } from './core/workflow';
export { WorkflowExecutor } from './core/executor';

// Node system
export { NodeRegistry, nodeRegistry } from './nodes/registry';
export { registerCoreNodes } from './nodes/definitions';
export { registerEnhancedNodes } from './nodes/enhanced-definitions';

// Expression parser
export { ExpressionParser } from './expression/parser';

// Storage
export { WorkflowStorage } from './storage/storage';
export { ExecutionHistoryStorage, type ExecutionRecord } from './storage/execution-history-storage';
export { WorkflowIndexManager, type WorkflowIndexEntry, type ExecutionIndexEntry, type WorkflowIndex } from './storage/workflow-index-manager';

// Services
export { ExecutionHistoryService } from './services/execution-history';
export { DebugService } from './services/debug-service';
export { CodeImportExportService } from './services/code-import-export';

// Editor (UI)
export { WorkflowEditor } from './editor/editor';
export { WorkflowCanvas } from './editor/canvas';
export { ConfigPanel } from './editor/panel';
export { EventEmitter as WorkflowEventEmitter } from './editor/event-emitter';

// Version
export const VERSION = '2.0.0';

/**
 * Initialize the workflow system
 * Call this once when your plugin loads
 */
export function initializeWorkflowSystem(registerEnhanced = false): void {
	// Import dependencies dynamically to ensure they're loaded
	const { nodeRegistry: registry } = require('./nodes/registry');
	const { registerCoreNodes: register } = require('./nodes/definitions');
	const { registerEnhancedNodes: registerEnhancedFn } = require('./nodes/enhanced-definitions');

	// Ensure core nodes are registered
	register();
	
	// Optionally register enhanced nodes
	if (registerEnhanced) {
		const enhancedNodes = registerEnhancedFn();
		for (const node of enhancedNodes) {
			registry.register(node);
		}
	}
	
	console.debug(`Workflow System V2 initialized (${VERSION})`);
	console.debug(`Registered nodes: ${registry.getAll().length}`);
}

/**
 * Quick start helper - creates a complete editor instance
 */
export async function createWorkflowEditor(
	container: HTMLElement,
	services: any,
	workflowId?: string
): Promise<any> {
	// Import dependencies dynamically
	const { WorkflowStorage: Storage } = require('./storage/storage');
	const { WorkflowGraph: Graph } = require('./core/workflow');
	const { WorkflowEditor: Editor } = require('./editor/editor');
	const { nodeRegistry: registry } = require('./nodes/registry');

	// Note: Styles are loaded via styles.css file automatically by Obsidian

	// Create storage
	const storage = new Storage(services.vault);

	// Load or create workflow
	let workflow: any;
	if (workflowId) {
		const loaded = await storage.load(workflowId);
		if (loaded) {
			workflow = Graph.fromJSON(loaded);
		} else {
			throw new Error(`Workflow ${workflowId} not found`);
		}
	} else {
		workflow = Graph.create('New Workflow');
	}

	// Create editor
	const editor = new Editor(
		container,
		workflow,
		storage,
		registry,
		services
	);

	return editor;
}

/**
 * Utility: Create a simple workflow programmatically
 */
export function createSimpleWorkflow(
	name: string,
	nodes: Array<{ type: string; config: Record<string, any> }>
): any {
	// Import dependencies dynamically
	const { WorkflowGraph: Graph } = require('./core/workflow');
	const { nodeRegistry: registry } = require('./nodes/registry');

	const workflow = Graph.create(name);

	// Add nodes with auto-layout
	const startX = 100;
	const startY = 100;
	const spacing = 250;

	const nodeIds: string[] = [];

	for (let i = 0; i < nodes.length; i++) {
		const { type, config } = nodes[i];
		const nodeDef = registry.get(type);

		if (!nodeDef) {
			throw new Error(`Unknown node type: ${type}`);
		}

		const nodeId = `node_${i}`;
		nodeIds.push(nodeId);

		workflow.addNode({
			id: nodeId,
			type,
			name: nodeDef.name,
			x: startX + i * spacing,
			y: startY,
			config,
		});

		// Connect to previous node
		if (i > 0) {
			workflow.addConnection({
				from: nodeIds[i - 1],
				to: nodeId,
			});
		}
	}

	return workflow;
}
