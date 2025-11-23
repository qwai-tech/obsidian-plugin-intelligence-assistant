/**
 * Workflow System V2 - Workflow Editor
 *
 * Main editor class that orchestrates canvas, sidebar, and config panel.
 * Provides a clean and intuitive interface for workflow editing.
 *
 * Custom styling for a more polished workflow editor UI
 */

import { WorkflowGraph } from '../core/workflow';
import { WorkflowStorage } from '../storage/storage';
import { NodeRegistry } from '../nodes/registry';
import { WorkflowExecutor } from '../core/executor';
import { WorkflowServices, WorkflowEvents, NodeExecutionState } from '../core/types';
import { WorkflowCanvas } from './canvas';
import { ConfigPanel } from './panel';
import { ExecutionDetailsPanel } from './execution-details-panel';
import { ExecutionInfoModal } from './execution-info-modal';
import { EventEmitter } from './event-emitter';
import { ExecutionHistoryStorage, ExecutionRecord } from '../storage/execution-history-storage';

// Import editor styles
import './styles-editor.css';

/**
 * Editor events
 */
interface EditorEvents extends WorkflowEvents {
	'editor:ready': void;
	'editor:destroyed': void;
	'history:show': void;
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
	private historyStorage?: ExecutionHistoryStorage;

	// UI components
	private canvas: WorkflowCanvas | null = null;
	private configPanel: ConfigPanel | null = null;
	private executionDetailsPanel: ExecutionDetailsPanel | null = null;
	private rightPanelContainer: HTMLElement | null = null;
	private toolbar: HTMLElement | null = null;
	private sidebar: HTMLElement | null = null;
	private historyPanel: HTMLElement | null = null;

	// Event system
	private events = new EventEmitter<EditorEvents>();

	// State
	private isDirty = false;
	private isExecuting = false;

	constructor(
		container: HTMLElement,
		workflow: WorkflowGraph,
		storage: WorkflowStorage,
		nodeRegistry: NodeRegistry,
		services: WorkflowServices,
		historyStorage?: ExecutionHistoryStorage
	) {
		this.container = container;
		this.workflow = workflow;
		this.storage = storage;
		this.nodeRegistry = nodeRegistry;
		this.services = services;
		this.historyStorage = historyStorage;

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

		// Create right panel container for config and execution details
		this.rightPanelContainer = mainArea.createDiv('workflow-v2-right-panel-container');
		this.rightPanelContainer.addClass('ia-hidden'); // Initially hidden
		this.createConfigPanel(this.rightPanelContainer);
		this.createExecutionDetailsPanel(this.rightPanelContainer);

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
		nameInput.placeholder = 'Workflow name';
		nameInput.addEventListener('input', () => {
			const data = this.workflow.getData();
			data.name = nameInput.value;
			this.markDirty();
		});

		// Spacer
		this.toolbar.createDiv('toolbar-spacer');

		// Execute button
		const executeBtn = this.toolbar.createEl('button', {
			text: '▶️ execute',
			cls: 'toolbar-btn toolbar-btn-primary',
		});
		executeBtn.addEventListener('click', () => {
			void this.execute();
		});

		// Save button
		const saveBtn = this.toolbar.createEl('button', {
			text: '💾 save',
			cls: 'toolbar-btn',
		});
		saveBtn.addEventListener('click', () => {
			void this.save();
		});

		// Export button
		const exportBtn = this.toolbar.createEl('button', {
			text: '📤 export',
			cls: 'toolbar-btn',
		});
		exportBtn.addEventListener('click', () => {
			void this.export();
		});

		// History button
		const historyBtn = this.toolbar.createEl('button', {
			text: '📜 history',
			cls: 'toolbar-btn',
		});
		historyBtn.addEventListener('click', () => {
			this.showHistory();
		});

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
				nodeItem.style.borderLeft = `3px solid ${nodeDef.color ?? ''}`;
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

		// Handle canvas events
		this.canvas.on('node:selected', ({ nodeId }) => {
			if (nodeId) {
				const node = this.workflow.getNode(nodeId);
				if (node) {
					// Show right panel container
					this.rightPanelContainer?.removeClass('ia-hidden');

					// Show config panel
					this.configPanel?.show(node);

					// Show execution details if available
					const executionState = this.canvas?.getNodeExecutionState(nodeId);
					if (executionState) {
						this.executionDetailsPanel?.show(nodeId, node.name, executionState);
					} else {
						this.executionDetailsPanel?.hide();
					}
				}
			} else {
				// Hide right panel container when no node selected
				this.rightPanelContainer?.addClass('ia-hidden');
				this.configPanel?.hide();
				this.executionDetailsPanel?.hide();
			}
		});

		this.canvas.on('node:added', (data) => {
			this.markDirty();
			this.events.emit('node:added', data);
		});

		this.canvas.on('node:updated', (data) => {
			this.markDirty();
			this.events.emit('node:updated', data);
		});

		this.canvas.on('node:removed', (data) => {
			this.markDirty();
			this.rightPanelContainer?.addClass('ia-hidden');
			this.configPanel?.hide();
			this.executionDetailsPanel?.hide();
			this.events.emit('node:removed', data);
		});

		this.canvas.on('node:edit', (data) => {
			this.events.emit('node:edit', data);
		});

		this.canvas.on('connection:added', (data) => {
			this.markDirty();
			this.events.emit('connection:added', data);
		});

		this.canvas.on('connection:removed', (data) => {
			this.markDirty();
			this.events.emit('connection:removed', data);
		});

		this.canvas.on('execution:details-click', (data: { nodeId: string; nodeName: string; executionState: NodeExecutionState }) => {
			// Show execution info modal
			const { nodeId, nodeName, executionState } = data;
			const modal = new ExecutionInfoModal(
				this.services.app as never,
				nodeId,
				nodeName,
				executionState
			);
			modal.open();
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
	 * Create execution details panel
	 */
	private createExecutionDetailsPanel(parent: HTMLElement): void {
		const panelContainer = parent.createDiv('workflow-v2-execution-details-panel');
		panelContainer.addClass('ia-hidden');

		this.executionDetailsPanel = new ExecutionDetailsPanel(panelContainer);

		// Handle panel close
		this.executionDetailsPanel.on('close', () => {
			// Keep panel state but hide it
		});
	}

	/**
	 * Set up event listeners
	 */
	private setupEventListeners(): void {
		// Handle unsaved changes
		window.addEventListener('beforeunload', (e) => {
			if (this.isDirty) {
				e.preventDefault();
			}
		});
	}

	/**
	 * Mark as dirty (unsaved changes)
	 */
	private markDirty(): void {
		this.isDirty = true;
		this.updateTitle();
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
			const rawName = this.workflow.getData().name;
			const name = typeof rawName === 'string' ? rawName : '';
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
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.showNotification(`❌ Save failed: ${errorMessage}`, 'error');
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

			if (result.success) {
				this.showNotification('✅ Execution completed', 'success');
				this.events.emit('execution:completed', { result });
			} else {
				this.showNotification(`❌ Execution failed: ${result.error ?? 'Unknown error'}`, 'error');
				this.events.emit('execution:error', { error: result.error || 'Unknown error' });
			}

			// Show execution log
			console.debug('Execution result:', result);

			// Save execution history
			if (this.historyStorage && result.log) {
				try {
					const workflowData = this.workflow.getData();
					await this.historyStorage.saveExecution(
						workflowData.id,
						workflowData.name,
						{
							success: result.success,
							duration: result.duration,
							error: result.error,
							log: result.log,
						},
						{
							triggeredBy: 'manual',
						}
					);
					console.debug('Execution history saved');
				} catch (error) {
					console.error('Failed to save execution history:', error);
				}
			}

		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.showNotification(`❌ Execution failed: ${errorMessage}`, 'error');
			this.events.emit('execution:error', { error: errorMessage });
		} finally {
			this.isExecuting = false;
			// Clear execution states after 2 seconds
			setTimeout(() => {
				this.canvas?.clearExecutionStates();
			}, 2000);
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
			const workflowName = this.workflow.getData().name ?? 'workflow';
			a.download = `${workflowName}.json`;
			a.click();
			URL.revokeObjectURL(url);

			this.showNotification('✅ Exported', 'success');
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.showNotification(`❌ Export failed: ${errorMessage}`, 'error');
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
	load(workflow: WorkflowGraph): void {
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
	 * Manually trigger canvas render
	 */
	render(): void {
		this.canvas?.render();
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
	 * Show execution history
	 */
	private showHistory(): void {
		if (!this.historyStorage) {
			this.showNotification('ℹ️ History storage not available', 'warning');
			return;
		}

		// Check if history panel already exists
		if (this.historyPanel) {
			this.historyPanel.remove();
			this.historyPanel = null;
			return;
		}

		// Create history panel
		const mainArea = this.container.querySelector('.workflow-v2-main') as HTMLElement;
		if (!mainArea) return;

		this.historyPanel = mainArea.createDiv('workflow-v2-history-panel');

		// Header
		const header = this.historyPanel.createDiv('history-panel-header');
		header.createDiv('history-panel-title').setText('Execution history');

		// Clear states button
		const clearBtn = header.createEl('button', { cls: 'history-panel-clear', text: '🗑 Clear' });
		clearBtn.addEventListener('click', () => {
			this.canvas?.clearExecutionStates();
			this.showNotification('✅ Execution states cleared', 'info');
		});

		const closeBtn = header.createEl('button', { cls: 'history-panel-close', text: '×' });
		closeBtn.addEventListener('click', () => {
			this.historyPanel?.remove();
			this.historyPanel = null;
		});

		// Content
		const content = this.historyPanel.createDiv('history-panel-content');

		// Load and display history
		void this.loadHistory(content);

		// Emit event
		this.events.emit('history:show', undefined);
	}

	/**
	 * Load execution state from history to canvas
	 */
	private loadExecutionStateToCanvas(execution: ExecutionRecord): void {
		// Clear existing execution states
		this.canvas?.clearExecutionStates();

		// Load execution states for each node from log
		for (const logEntry of execution.log) {
			this.canvas?.updateNodeState(logEntry.nodeId, {
				status: logEntry.status,
				startTime: logEntry.startTime,
				endTime: logEntry.endTime,
				duration: logEntry.duration,
				input: logEntry.input,
				output: logEntry.output,
			});
		}

		// Close history panel
		this.historyPanel?.remove();
		this.historyPanel = null;

		this.showNotification('✅ Execution state loaded', 'success');
	}

	/**
	 * Load execution history
	 */
	private async loadHistory(container: HTMLElement): Promise<void> {
		if (!this.historyStorage) return;

		container.createDiv('history-loading').setText('Loading history...');

		try {
			const workflowId = this.workflow.getData().id;
			const executions = await this.historyStorage.listExecutions(workflowId, 20);

			container.empty();

			if (executions.length === 0) {
				container.createDiv('history-empty').setText('No execution history yet');
				return;
			}

			const list = container.createDiv('history-list');

			for (const execution of executions) {
				const item = list.createDiv('history-item');

				// Header
				const itemHeader = item.createDiv('history-item-header');
				const status = itemHeader.createDiv('history-item-status');
				status.addClass(execution.success ? 'success' : 'error');
				status.setText(execution.success ? '✅' : '❌');

				const time = new Date(execution.timestamp).toLocaleString();
				itemHeader.createDiv('history-item-time').setText(time);
				itemHeader.createDiv('history-item-duration').setText(`${execution.duration}ms`);

				// Details (expandable on click)
				let detailsShown = false;
				itemHeader.addEventListener('click', () => {
					if (!detailsShown) {
						const details = item.createDiv('history-item-details');

						// Metadata
						if (execution.metadata) {
							const metadata = details.createDiv('history-item-metadata');
							for (const [key, value] of Object.entries(execution.metadata)) {
								metadata.createDiv('history-metadata-item').setText(`${key}: ${String(value)}`);
							}
						}

						// Log summary
						details.createDiv('history-log-summary').setText(
							`${execution.log.length} nodes executed`
						);

						// Error if any
						if (execution.error) {
							details.createDiv('history-item-error').setText(execution.error);
						}

						// Button to show execution on canvas
						const showBtn = details.createEl('button', {
							cls: 'history-show-btn',
							text: '👁 Load to canvas'
						});
						showBtn.addEventListener('click', (e) => {
							e.stopPropagation();
							this.loadExecutionStateToCanvas(execution);
						});

						detailsShown = true;
					} else {
						const details = item.querySelector('.history-item-details');
						details?.remove();
						detailsShown = false;
					}
				});
			}
		} catch (error) {
			container.empty();
			const errorDiv = container.createDiv('history-error');
			errorDiv.setText(`Failed to load history: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Destroy editor
	 */
	destroy(): void {
		this.canvas?.destroy();
		this.configPanel?.destroy();
		this.executionDetailsPanel?.destroy();
		this.events.emit('editor:destroyed', undefined);
		this.events.clear();
		this.container.empty();
	}
}
