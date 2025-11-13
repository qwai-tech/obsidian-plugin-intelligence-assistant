/**
 * Workflow System V2 - Workflow Editor
 *
 * Main editor class that orchestrates canvas, sidebar, and config panel.
 * Provides a clean and intuitive interface for workflow editing.
 *
 * Now using Ant Design styling for professional UI/UX
 */

import { WorkflowGraph } from '../core/workflow';
import { WorkflowStorage } from '../storage/storage';
import { ExecutionHistoryStorage, ExecutionRecord } from '../storage/execution-history-storage';
import { WorkflowIndexManager } from '../storage/workflow-index-manager';
import { NodeRegistry } from '../nodes/registry';
import { WorkflowExecutor } from '../core/executor';
import { WorkflowNode, WorkflowServices, WorkflowEvents } from '../core/types';
import { WorkflowCanvas } from './canvas';
import { ConfigPanel } from './panel';
import { NodeConfigModal } from './node-config-modal';
import { EventEmitter } from './event-emitter';

// Import Ant Design styles
import './styles-antd.css';
// Import Modal styles
import './modal-styles.css';

/**
 * Editor events
 */
interface EditorEvents extends WorkflowEvents {
	'editor:ready': void;
	'editor:destroyed': void;
}

/**
 * Workflow editor - main editor class
 */
export class WorkflowEditor {
	private container: HTMLElement;
	private workflow: WorkflowGraph;
	private storage: WorkflowStorage;
	private nodeRegistry: NodeRegistry;
	private services: WorkflowServices;

	// History and index storage
	private executionHistoryStorage: ExecutionHistoryStorage | null = null;
	private indexManager: WorkflowIndexManager | null = null;

	// UI components
	private canvas: WorkflowCanvas | null = null;
	private configPanel: ConfigPanel | null = null;
	private toolbar: HTMLElement | null = null;
	private sidebar: HTMLElement | null = null;
	private historyPanel: HTMLElement | null = null;

	// Event system
	private events = new EventEmitter<EditorEvents>();

	// State
	private isDirty = false;
	private isExecuting = false;
	private lastExecutionResult: any = null;
	private autoSaveTimer: NodeJS.Timeout | null = null;
	private autoSaveDelay = 2000; // Auto-save after 2 seconds of inactivity

	constructor(
		container: HTMLElement,
		workflow: WorkflowGraph,
		storage: WorkflowStorage,
		nodeRegistry: NodeRegistry,
		services: WorkflowServices,
		executionHistoryStorage?: ExecutionHistoryStorage,
		indexManager?: WorkflowIndexManager
	) {
		this.container = container;
		this.workflow = workflow;
		this.storage = storage;
		this.nodeRegistry = nodeRegistry;
		this.services = services;
		this.executionHistoryStorage = executionHistoryStorage || null;
		this.indexManager = indexManager || null;

		this.initialize();
	}

	/**
	 * Initialize editor
	 */
	private initialize(): void {
		// Clear container
		this.container.empty();
		this.container.addClass('workflow-v2-editor');

		// Create layout
		this.createToolbar();
		const mainArea = this.createMainArea();
		this.createSidebar(mainArea);
		this.createCanvas(mainArea);
		this.createConfigPanel(mainArea);
		this.createHistoryPanel(mainArea);

		// Set up event listeners
		this.setupEventListeners();

		// Emit ready event
		this.events.emit('editor:ready', undefined);
	}

	/**
	 * Create toolbar
	 */
	private createToolbar(): void {
		this.toolbar = this.container.createDiv('workflow-v2-toolbar');

		// Workflow name
		const nameInput = this.toolbar.createEl('input', {
			type: 'text',
			cls: 'workflow-name-input',
			value: this.workflow.getData().name,
		});
		nameInput.placeholder = 'Workflow Name';
		nameInput.addEventListener('input', () => {
			const data = this.workflow.getData();
			data.name = nameInput.value;
			this.markDirty();
		});

		// Spacer
		this.toolbar.createDiv('toolbar-spacer');

		// Execute button
		const executeBtn = this.toolbar.createEl('button', {
			text: '▶️ Execute',
			cls: 'toolbar-btn toolbar-btn-primary',
		});
		executeBtn.addEventListener('click', () => this.execute());

		// Save button
		const saveBtn = this.toolbar.createEl('button', {
			text: '💾 Save',
			cls: 'toolbar-btn',
		});
		saveBtn.addEventListener('click', () => this.save());

		// History button
		const historyBtn = this.toolbar.createEl('button', {
			text: '📜 History',
			cls: 'toolbar-btn',
		});
		historyBtn.addEventListener('click', () => this.showExecutionHistory());

		// Export button
		const exportBtn = this.toolbar.createEl('button', {
			text: '📤 Export',
			cls: 'toolbar-btn',
		});
		exportBtn.addEventListener('click', () => this.export());

		// Zoom controls
		const zoomGroup = this.toolbar.createDiv('toolbar-group');

		const zoomOutBtn = zoomGroup.createEl('button', {
			text: '−',
			cls: 'toolbar-btn toolbar-btn-icon',
		});
		zoomOutBtn.addEventListener('click', () => this.canvas?.zoomOut());

		const zoomResetBtn = zoomGroup.createEl('button', {
			text: '100%',
			cls: 'toolbar-btn toolbar-btn-icon',
		});
		zoomResetBtn.addEventListener('click', () => this.canvas?.resetZoom());

		const zoomInBtn = zoomGroup.createEl('button', {
			text: '+',
			cls: 'toolbar-btn toolbar-btn-icon',
		});
		zoomInBtn.addEventListener('click', () => this.canvas?.zoomIn());
	}

	/**
	 * Create main area
	 */
	private createMainArea(): HTMLElement {
		return this.container.createDiv('workflow-v2-main');
	}

	/**
	 * Create sidebar
	 */
	private createSidebar(parent: HTMLElement): void {
		this.sidebar = parent.createDiv('workflow-v2-sidebar');

		// Search box
		const searchBox = this.sidebar.createEl('input', {
			type: 'text',
			cls: 'sidebar-search',
			placeholder: 'Search nodes...',
		});

		let searchTimeout: NodeJS.Timeout;
		searchBox.addEventListener('input', () => {
			clearTimeout(searchTimeout);
			searchTimeout = setTimeout(() => {
				this.filterNodes(searchBox.value);
			}, 300);
		});

		// Node list
		const nodeList = this.sidebar.createDiv('sidebar-node-list');
		this.renderNodeList(nodeList);
	}

	/**
	 * Render node list
	 */
	private renderNodeList(container: HTMLElement, filter?: string): void {
		container.empty();

		// Get nodes
		const nodes = filter
			? this.nodeRegistry.search(filter)
			: this.nodeRegistry.getAll();

		// Group by category
		const categories = new Map<string, typeof nodes>();
		for (const node of nodes) {
			if (!categories.has(node.category)) {
				categories.set(node.category, []);
			}
			categories.get(node.category)!.push(node);
		}

		// Category labels
		const categoryLabels: Record<string, string> = {
			trigger: 'Triggers',
			ai: 'AI',
			data: 'Data',
			logic: 'Logic',
			tools: 'Tools',
			memory: 'Memory',
		};

		// Render categories
		for (const [category, categoryNodes] of categories) {
			const categoryDiv = container.createDiv('node-category');

			// Category header
			const header = categoryDiv.createDiv('node-category-header');
			header.createSpan({ text: categoryLabels[category] || category });
			header.createSpan({ text: String(categoryNodes.length), cls: 'node-count' });

			// Category nodes
			const nodeItems = categoryDiv.createDiv('node-category-items');

			for (const nodeDef of categoryNodes) {
				const nodeItem = nodeItems.createDiv('node-item');
				nodeItem.draggable = true;

				// Icon
				nodeItem.createSpan({ text: nodeDef.icon, cls: 'node-item-icon' });

				// Info
				const info = nodeItem.createDiv('node-item-info');
				info.createDiv('node-item-name').setText(nodeDef.name);
				info.createDiv('node-item-desc').setText(nodeDef.description);

				// Drag start
				nodeItem.addEventListener('dragstart', (e) => {
					e.dataTransfer!.setData('nodeType', nodeDef.type);
					e.dataTransfer!.effectAllowed = 'copy';
				});

				// Hover effect
				nodeItem.setCssProps({ 'border-left': `3px solid ${nodeDef.color}` });
			}
		}
	}

	/**
	 * Filter nodes
	 */
	private filterNodes(query: string): void {
		const nodeList = this.sidebar?.querySelector('.sidebar-node-list') as HTMLElement;
		if (nodeList) {
			this.renderNodeList(nodeList, query);
		}
	}

	/**
	 * Create canvas
	 */
	private createCanvas(parent: HTMLElement): void {
		const canvasContainer = parent.createDiv('workflow-v2-canvas-container');
		const canvasEl = canvasContainer.createEl('canvas', { cls: 'workflow-v2-canvas' });

		// Create canvas renderer
		this.canvas = new WorkflowCanvas(
			canvasEl,
			this.workflow,
			this.nodeRegistry
		);

		// Handle canvas events - only handle node:edit for modal opening
		this.canvas.on('node:edit', ({ nodeId }) => {
			if (!this.canvas) return;

			const node = this.workflow.getNode(nodeId);
			if (node) {
				this.openNodeConfigModal(node);
			}
		});

		this.canvas.on('node:added', () => {
			this.markDirty();
			this.canvas?.clearExecutionStates();
		});

		this.canvas.on('node:updated', () => {
			this.markDirty();
			this.canvas?.clearExecutionStates();
		});

		this.canvas.on('node:removed', () => {
			this.markDirty();
			this.configPanel?.hide();
			this.canvas?.clearExecutionStates();
		});

		this.canvas.on('connection:added', () => {
			this.markDirty();
			this.canvas?.clearExecutionStates();
		});

		this.canvas.on('connection:removed', () => {
			this.markDirty();
			this.canvas?.clearExecutionStates();
		});

		// Handle execution data view request
		this.canvas.on('execution:view-full', ({ nodeId, log }) => {
			this.showExecutionDataModal(nodeId, log);
		});
	}

	/**
	 * Create config panel
	 */
	private createConfigPanel(parent: HTMLElement): void {
		const panelContainer = parent.createDiv('workflow-v2-config-panel');
		panelContainer.addClass('ia-hidden');

		this.configPanel = new ConfigPanel(
			panelContainer,
			this.nodeRegistry,
			this.services
		);

		// Handle config updates
		this.configPanel.on('update', ({ nodeId, config }) => {
			this.workflow.updateNode(nodeId, { config });
			this.canvas?.render();
			this.markDirty();
		});

		this.configPanel.on('delete', ({ nodeId }) => {
			this.workflow.removeNode(nodeId);
			this.canvas?.render();
			this.configPanel?.hide();
			this.markDirty();
		});

		this.configPanel.on('close', () => {
			this.canvas?.deselectAll();
		});
	}

	/**
	 * Create execution history panel
	 */
	private createHistoryPanel(parent: HTMLElement): void {
		this.historyPanel = parent.createDiv('workflow-v2-history-panel');
		this.historyPanel.addClass('ia-hidden');

		// Header
		const header = this.historyPanel.createDiv('history-panel-header');
		header.createSpan({ text: 'Execution History', cls: 'history-panel-title' });

		const closeBtn = header.createEl('button', {
			text: '✕',
			cls: 'history-panel-close',
		});
		closeBtn.addEventListener('click', () => {
			this.historyPanel!.addClass('ia-hidden');
		});

		// Content
		this.historyPanel.createDiv('history-panel-content');
	}

	/**
	 * Update execution history panel
	 */
	private async updateHistoryPanel(): Promise<void> {
		if (!this.historyPanel) return;

		const content = this.historyPanel.querySelector('.history-panel-content') as HTMLElement;
		if (!content) return;

		content.empty();

		// Show loading indicator
		const loadingDiv = content.createDiv('history-loading');
		loadingDiv.setText('Loading execution history...');

		// Load execution history from storage
		if (!this.executionHistoryStorage || !this.indexManager) {
			content.empty();
			content.createDiv('history-empty').setText('Execution history storage not available');
			return;
		}

		try {
			const workflowId = this.workflow.getData().id;
			const executions = await this.executionHistoryStorage.listExecutions(workflowId, 50); // Load last 50 executions

			content.empty();

			if (executions.length === 0) {
				content.createDiv('history-empty').setText('No execution history yet');
				return;
			}

			// Display execution history list
			const historyList = content.createDiv('history-list');

			for (const execution of executions) {
				const historyItem = historyList.createDiv('history-item');
				historyItem.dataset.executionId = execution.id;

				// Status indicator
				const statusIcon = execution.success ? '✅' : '❌';
				const statusClass = execution.success ? 'success' : 'error';

				// Format timestamp
				const date = new Date(execution.timestamp);
				const timeStr = date.toLocaleString();

				// Create item header
				const itemHeader = historyItem.createDiv('history-item-header');
				itemHeader.createSpan({ text: statusIcon, cls: `history-item-status ${statusClass}` });
				itemHeader.createSpan({ text: timeStr, cls: 'history-item-time' });
				itemHeader.createSpan({ text: `${execution.duration}ms`, cls: 'history-item-duration' });

				// Create item details (collapsed by default)
				const itemDetails = historyItem.createDiv('history-item-details');
				itemDetails.addClass('ia-hidden');

				// Metadata
				if (execution.metadata) {
					const metadataDiv = itemDetails.createDiv('history-item-metadata');
					if (execution.metadata.triggeredBy) {
						metadataDiv.createSpan({
							text: `Triggered by: ${execution.metadata.triggeredBy}`,
							cls: 'history-metadata-item'
						});
					}
					if (execution.metadata.userNote) {
						metadataDiv.createDiv('history-metadata-note').setText(execution.metadata.userNote);
					}
				}

				// Node execution summary
				if (execution.log && execution.log.length > 0) {
					const logSummary = itemDetails.createDiv('history-log-summary');
					const completedCount = execution.log.filter(e => e.status === 'completed').length;
					const errorCount = execution.log.filter(e => e.status === 'error').length;
					logSummary.setText(`Nodes: ${execution.log.length} total, ${completedCount} completed, ${errorCount} errors`);
				}

				if (execution.error) {
					const errorDiv = itemDetails.createDiv('history-item-error');
					errorDiv.setText(`Error: ${execution.error}`);
				}

				// Click to expand/collapse
				itemHeader.addClass('ia-clickable');
				itemHeader.addEventListener('click', () => {
					const isVisible = itemDetails.style.display !== 'none';
					itemDetails.setCssProps({ 'display': isVisible ? 'none' : 'block' });
				});

				// Double-click to load execution results on canvas
				historyItem.addEventListener('dblclick', () => {
					this.loadExecutionOnCanvas(execution);
				});
			}

		} catch (error) {
			console.error('Failed to load execution history:', error);
			content.empty();
			content.createDiv('history-error').setText(`Failed to load execution history: ${error.message}`);
		}
	}

	/**
	 * Load execution results on canvas
	 */
	private loadExecutionOnCanvas(execution: ExecutionRecord): void {
		if (!this.canvas) return;

		// Clear previous execution states
		this.canvas.clearExecutionStates();

		// Load execution states and logs onto canvas
		if (execution.log && execution.log.length > 0) {
			// Update node execution states
			for (const logEntry of execution.log) {
				// Map 'completed' status to 'success' for canvas display
				const status = logEntry.status === 'completed' ? 'success' : logEntry.status;
				const state = {
					status: status as 'pending' | 'running' | 'success' | 'error',
					startTime: logEntry.startTime,
					endTime: logEntry.endTime,
				};
				this.canvas.updateNodeState(logEntry.nodeId, state);
			}

			// Update execution logs with input/output
			const logsForCanvas = execution.log
				.filter((entry: any) => entry.status === 'completed')
				.map((entry: any) => ({
					nodeId: entry.nodeId,
					input: entry.input,
					output: entry.output,
				}));
			this.canvas.updateExecutionLogs(logsForCanvas);
		}

		// Store as lastExecutionResult so it can be referenced
		this.lastExecutionResult = {
			success: execution.success,
			duration: execution.duration,
			error: execution.error,
			log: execution.log,
		};

		// Show notification
		const date = new Date(execution.timestamp);
		const timeStr = date.toLocaleString();
		this.showNotification(`📜 Loaded execution from ${timeStr}`, 'info');
	}

	/**
	 * Show execution history
	 */
	private async showExecutionHistory(): Promise<void> {
		if (!this.historyPanel) return;

		this.historyPanel.removeClass('ia-hidden');
		this.configPanel?.hide();
		await this.updateHistoryPanel();
	}

	/**
	 * Show execution data modal
	 */
	private showExecutionDataModal(nodeId: string, log: { input?: any; output?: any }): void {
		const app = (this.services as any)?.app || (window as any).app;
		if (!app) {
			console.error('App instance not available for modal');
			return;
		}

		// Get node details
		const node = this.workflow.getNode(nodeId);
		if (!node) return;

		const nodeDef = this.nodeRegistry.get(node.type);
		if (!nodeDef) return;

		// Import and use Modal
		const { Modal } = require('obsidian');

		class ExecutionDataModal extends Modal {
			constructor(app: any, private nodeData: { node: WorkflowNode; nodeDef: any; log: { input?: any; output?: any } }) {
				super(app);
			}

			onOpen() {
				const { contentEl } = this;
				contentEl.empty();
				contentEl.addClass('execution-data-modal');

				// Title
				this.setTitle(`${this.nodeData.nodeDef.icon} ${this.nodeData.node.name} - Execution Data`);

				// Scrollable content
				const content = contentEl.createDiv('execution-modal-content');

				// Node info section
				const infoSection = content.createDiv('execution-modal-section');
				infoSection.createDiv('execution-modal-section-title').setText('Node Information');

				const infoGrid = infoSection.createDiv('execution-modal-info-grid');

				const nameRow = infoGrid.createDiv('execution-modal-info-row');
				nameRow.createSpan({ text: 'Name:', cls: 'execution-modal-label' });
				nameRow.createSpan({ text: this.nodeData.node.name, cls: 'execution-modal-value' });

				const typeRow = infoGrid.createDiv('execution-modal-info-row');
				typeRow.createSpan({ text: 'Type:', cls: 'execution-modal-label' });
				typeRow.createSpan({ text: this.nodeData.nodeDef.name, cls: 'execution-modal-value' });

				// Input section
				if (this.nodeData.log.input) {
					const inputSection = content.createDiv('execution-modal-section');
					const inputHeader = inputSection.createDiv('execution-modal-section-header');
					inputHeader.createDiv('execution-modal-section-title').setText('Input Data');

					const copyInputBtn = inputHeader.createEl('button', {
						text: '📋 Copy',
						cls: 'execution-modal-btn',
					});
					copyInputBtn.addEventListener('click', () => {
						navigator.clipboard.writeText(JSON.stringify(this.nodeData.log.input, null, 2));
						// @ts-ignore
						new Notice('Input data copied to clipboard');
					});

					const inputCode = inputSection.createEl('pre', { cls: 'execution-modal-code' });
					const inputCodeEl = inputCode.createEl('code');
					inputCodeEl.setText(JSON.stringify(this.nodeData.log.input, null, 2));
				}

				// Output section
				if (this.nodeData.log.output) {
					const outputSection = content.createDiv('execution-modal-section');
					const outputHeader = outputSection.createDiv('execution-modal-section-header');
					outputHeader.createDiv('execution-modal-section-title').setText('Output Data');

					const copyOutputBtn = outputHeader.createEl('button', {
						text: '📋 Copy',
						cls: 'execution-modal-btn',
					});
					copyOutputBtn.addEventListener('click', () => {
						navigator.clipboard.writeText(JSON.stringify(this.nodeData.log.output, null, 2));
						// @ts-ignore
						new Notice('Output data copied to clipboard');
					});

					const outputCode = outputSection.createEl('pre', { cls: 'execution-modal-code' });
					const outputCodeEl = outputCode.createEl('code');
					outputCodeEl.setText(JSON.stringify(this.nodeData.log.output, null, 2));
				}
			}

			onClose() {
				const { contentEl } = this;
				contentEl.empty();
			}
		}

		const modal = new ExecutionDataModal(app, { node, nodeDef, log });
		modal.open();
	}

	/**
	 * Set up event listeners
	 */
	private setupEventListeners(): void {
		// Handle unsaved changes
		window.addEventListener('beforeunload', (e) => {
			if (this.isDirty) {
				e.preventDefault();
				e.returnValue = '';
			}
		});
	}

	/**
	 * Mark as dirty (unsaved changes)
	 */
	private markDirty(): void {
		this.isDirty = true;
		this.updateTitle();
		this.scheduleAutoSave();
	}

	/**
	 * Schedule auto-save
	 */
	private scheduleAutoSave(): void {
		// Clear existing timer
		if (this.autoSaveTimer) {
			clearTimeout(this.autoSaveTimer);
		}

		// Schedule new auto-save
		this.autoSaveTimer = setTimeout(() => {
			if (this.isDirty) {
				this.autoSave();
			}
		}, this.autoSaveDelay);
	}

	/**
	 * Auto-save workflow (silent save without notification)
	 */
	private async autoSave(): Promise<void> {
		try {
			await this.storage.save(this.workflow.toJSON());
			this.markClean();
			// Emit event but no notification for auto-save
			this.events.emit('workflow:saved', { workflow: this.workflow.toJSON() });
			console.debug('Workflow auto-saved');
		} catch (error: any) {
			console.error('Auto-save failed:', error);
			// Don't show error notification for auto-save failures
		}
	}

	/**
	 * Mark as clean (saved)
	 */
	private markClean(): void {
		this.isDirty = false;
		this.updateTitle();
	}

	/**
	 * Update title
	 */
	private updateTitle(): void {
		const nameInput = this.toolbar?.querySelector('.workflow-name-input') as HTMLInputElement;
		if (nameInput) {
			const name = this.workflow.getData().name;
			nameInput.value = this.isDirty ? `${name} *` : name;
		}
	}

	/**
	 * Save workflow
	 */
	async save(): Promise<void> {
		try {
			await this.storage.save(this.workflow.toJSON());
			this.markClean();
			this.showNotification('✅ Saved', 'success');
			this.events.emit('workflow:saved', { workflow: this.workflow.toJSON() });
		} catch (error: any) {
			this.showNotification(`❌ Save failed: ${error.message}`, 'error');
		}
	}

	/**
	 * Execute workflow
	 */
	async execute(): Promise<void> {
		if (this.isExecuting) {
			this.showNotification('⚠️ Workflow is already executing', 'warning');
			return;
		}

		// Validate
		const errors = this.workflow.validate();
		if (errors.length > 0) {
			this.showNotification(`❌ Validation failed:\n${errors.join('\n')}`, 'error');
			return;
		}

		// Clear previous execution results before starting new execution
		this.canvas?.clearExecutionStates();

		this.isExecuting = true;
		this.showNotification('⚡ Executing...', 'info');
		this.events.emit('execution:started', { workflow: this.workflow.toJSON() });

		try {
			const executor = new WorkflowExecutor(this.nodeRegistry);

			const result = await executor.execute(
				this.workflow,
				this.services,
				(nodeId, state) => {
					// Update canvas with execution state
					this.canvas?.updateNodeState(nodeId, state);
				}
			);

			// Store execution result
			this.lastExecutionResult = result;

			// Update canvas with input/output data from execution log
			if (result.log && result.log.length > 0) {
				const logsForCanvas = result.log
					.filter((entry: any) => entry.status === 'completed')
					.map((entry: any) => ({
						nodeId: entry.nodeId,
						input: entry.input,
						output: entry.output
					}));
				this.canvas?.updateExecutionLogs(logsForCanvas);
			}

			if (result.success) {
				this.showNotification('✅ Execution completed', 'success');
				this.events.emit('execution:completed', { result });
			} else {
				this.showNotification(`❌ Execution failed: ${result.error}`, 'error');
				this.events.emit('execution:error', { error: result.error || 'Unknown error' });
			}

			// Show execution log
			console.debug('Execution result:', result);

			// Save execution history
			await this.saveExecutionHistory(result);

		} catch (error: any) {
			this.showNotification(`❌ Execution failed: ${error.message}`, 'error');
			this.events.emit('execution:error', { error: error.message });

			// Save failed execution history
			await this.saveExecutionHistory({
				success: false,
				duration: 0,
				error: error.message,
				log: [],
			});
		} finally {
			this.isExecuting = false;
			// Execution results will stay on nodes until:
			// - Next execution starts
			// - Canvas is modified (nodes added/removed/updated, connections changed)
			// - Editor is closed
		}
	}

	/**
	 * Export workflow
	 */
	async export(): Promise<void> {
		try {
			const json = await this.storage.export(this.workflow.getData().id);

			// Create download link
			const blob = new Blob([json], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${this.workflow.getData().name}.json`;
			a.click();
			URL.revokeObjectURL(url);

			this.showNotification('✅ Exported', 'success');
		} catch (error: any) {
			this.showNotification(`❌ Export failed: ${error.message}`, 'error');
		}
	}

	/**
	 * Save execution history
	 */
	private async saveExecutionHistory(result: any): Promise<void> {
		// Check if history storage is available
		if (!this.executionHistoryStorage || !this.indexManager) {
			console.debug('Execution history storage not available, skipping save');
			return;
		}

		try {
			const workflowData = this.workflow.getData();
			const workflowId = workflowData.id;
			const workflowName = workflowData.name;

			// Save execution record
			const executionId = await this.executionHistoryStorage.saveExecution(
				workflowId,
				workflowName,
				result,
				{
					triggeredBy: 'manual',
				}
			);

			// Update index
			const timestamp = Date.now();
			const executionFolder = `workflow/${workflowId}/execution`;
			const date = new Date(timestamp).toISOString().split('T')[0];
			const filePath = `${executionFolder}/${date}-${executionId}.json`;

			await this.indexManager.recordExecution(
				workflowId,
				executionId,
				timestamp,
				result.duration,
				result.success,
				filePath
			);

			console.debug('Execution history saved:', executionId);
		} catch (error) {
			console.error('Failed to save execution history:', error);
			// Don't show error to user, just log it
		}
	}

	/**
	 * Show notification
	 */
	private showNotification(message: string, type: 'success' | 'error' | 'warning' | 'info'): void {
		// Create notification element
		const notification = document.body.createDiv('workflow-v2-notification');
		notification.addClass(`notification-${type}`);
		notification.setText(message);

		// Auto remove after 3 seconds
		setTimeout(() => {
			notification.addClass('notification-fade');
			setTimeout(() => notification.remove(), 300);
		}, 3000);
	}

	/**
	 * Load workflow
	 */
	async load(workflow: WorkflowGraph): Promise<void> {
		this.workflow = workflow;
		this.canvas?.setWorkflow(workflow);
		this.configPanel?.hide();
		this.markClean();
	}

	/**
	 * Get workflow
	 */
	getWorkflow(): WorkflowGraph {
		return this.workflow;
	}

	/**
	 * Check if dirty
	 */
	isDirtyState(): boolean {
		return this.isDirty;
	}

	/**
	 * Open node configuration modal
	 */
	private openNodeConfigModal(node: WorkflowNode): void {
		// We need app instance to create modal - get it from services or container
		const app = (this.services as any)?.app || (window as any).app;

		if (!app) {
			console.error('App instance not available for modal');
			return;
		}

		// Always get the latest node data from workflow to ensure we have the current config
		const latestNode = this.workflow.getNode(node.id);
		if (!latestNode) {
			console.error('Node not found in workflow');
			return;
		}

		const modal = new NodeConfigModal(app, latestNode, this.nodeRegistry, this.workflow, this.services);

		// Handle config updates
		modal.on('update', ({ nodeId, config }) => {
			console.debug('[Editor] Received config update for node:', nodeId, config);
			this.workflow.updateNode(nodeId, { config });

			// Verify the update was applied
			const updatedNode = this.workflow.getNode(nodeId);
			console.debug('[Editor] Node after update:', updatedNode?.config);

			this.canvas?.render();
			this.markDirty();
		});

		modal.open();
	}

	/**
	 * Add event listener
	 */
	on<K extends keyof EditorEvents>(event: K, handler: (data: EditorEvents[K]) => void): void {
		this.events.on(event, handler);
	}

	/**
	 * Remove event listener
	 */
	off<K extends keyof EditorEvents>(event: K, handler: (data: EditorEvents[K]) => void): void {
		this.events.off(event, handler);
	}

	/**
	 * Destroy editor
	 */
	destroy(): void {
		// Clear auto-save timer
		if (this.autoSaveTimer) {
			clearTimeout(this.autoSaveTimer);
			this.autoSaveTimer = null;
		}

		// Auto-save before destroying if there are unsaved changes
		if (this.isDirty) {
			this.autoSave();
		}

		this.canvas?.destroy();
		this.configPanel?.destroy();
		this.events.emit('editor:destroyed', undefined);
		this.events.clear();
		this.container.empty();
	}
}
