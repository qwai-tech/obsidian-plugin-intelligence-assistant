/**
 * Workflow System V2 - Main Entry Point
 *
 * Exports all public APIs for the workflow system.
 * This is the only file that should be imported by external code.
 */

import type { Vault } from 'obsidian';
import type { WorkflowServices } from './core/types';
import { WorkflowGraph } from './core/workflow';
import { WorkflowStorage } from './storage/storage';
import { WorkflowEditor } from './editor/editor';
import { nodeRegistry } from './nodes/registry';
import { registerCoreNodes } from './nodes/definitions';
import { registerEnhancedNodes } from './nodes/enhanced-definitions';

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
	// Use static imports already defined at top of file
	registerCoreNodes();

	// Optionally register enhanced nodes
	if (registerEnhanced) {
		const enhancedNodes = registerEnhancedNodes();
		for (const node of enhancedNodes) {
			nodeRegistry.register(node);
		}
	}

	console.debug(`Workflow System V2 initialized (${VERSION})`);
	console.debug(`Registered nodes: ${nodeRegistry.getAll().length}`);
}

/**
 * Quick start helper - creates a complete editor instance
 */
export async function createWorkflowEditor(
	container: HTMLElement,
	services: WorkflowServices,
	workflowId?: string
): Promise<WorkflowEditor> {
	// Use static imports already defined at top of file
	// Note: Styles are loaded via styles.css file automatically by Obsidian

	assertWorkflowVault(services);

	// Create storage
	const storage = new WorkflowStorage(services.vault);

	// Load or create workflow
	let workflow: WorkflowGraph;
	if (workflowId) {
		const loaded = await storage.load(workflowId);
		if (loaded) {
			workflow = WorkflowGraph.fromJSON(loaded);
		} else {
			throw new Error(`Workflow ${workflowId} not found`);
		}
	} else {
		workflow = WorkflowGraph.create('New Workflow');
	}

	// Create editor
	const editor = new WorkflowEditor(container, workflow, storage, nodeRegistry, services);

	return editor;
}

/**
 * Utility: Create a simple workflow programmatically
 */
export function createSimpleWorkflow(
	name: string,
	nodes: Array<{ type: string; config: Record<string, unknown> }>
): WorkflowGraph {
	// Use static imports already defined at top of file
	const workflow = WorkflowGraph.create(name);

	// Add nodes with auto-layout
	const startX = 100;
	const startY = 100;
	const spacing = 250;

	const nodeIds: string[] = [];

	for (let i = 0; i < nodes.length; i++) {
		const { type, config } = nodes[i];
		const nodeDef = nodeRegistry.get(type);

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
				id: `edge_${nodeIds[i - 1]}_${nodeId}`,
				from: nodeIds[i - 1],
				to: nodeId,
			});
		}
	}

	return workflow;
}

function assertWorkflowVault(services: WorkflowServices): asserts services is WorkflowServices & { vault: Vault } {
	if (!services.vault) {
		throw new Error('Workflow services must include a vault instance');
	}
}
