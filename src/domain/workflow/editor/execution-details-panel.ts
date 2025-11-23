/**
 * Workflow System V2 - Execution Details Panel
 *
 * Displays execution details for a selected node including:
 * - Input data
 * - Output data
 * - Execution metadata (duration, status, timestamps)
 * - Error messages
 */

import { NodeExecutionState } from '../core/types';
import { EventEmitter } from './event-emitter';

/**
 * Panel events
 */
interface ExecutionDetailsPanelEvents extends Record<string, unknown> {
	'close': void;
}

/**
 * Execution details panel - shows execution info for a node
 */
export class ExecutionDetailsPanel {
	private container: HTMLElement;
	private currentNodeId: string | null = null;
	private currentNodeName: string | null = null;
	private currentExecutionState: NodeExecutionState | null = null;
	private events = new EventEmitter<ExecutionDetailsPanelEvents>();

	constructor(container: HTMLElement) {
		this.container = container;
	}

	/**
	 * Show panel for a node's execution state
	 */
	show(nodeId: string, nodeName: string, executionState: NodeExecutionState): void {
		this.currentNodeId = nodeId;
		this.currentNodeName = nodeName;
		this.currentExecutionState = executionState;
		this.container.removeClass('ia-hidden');
		this.render();
	}

	/**
	 * Hide panel
	 */
	hide(): void {
		this.container.addClass('ia-hidden');
		this.currentNodeId = null;
		this.currentNodeName = null;
		this.currentExecutionState = null;
		this.events.emit('close', undefined);
	}

	/**
	 * Update execution state
	 */
	update(executionState: NodeExecutionState): void {
		this.currentExecutionState = executionState;
		this.render();
	}

	/**
	 * Render panel
	 */
	private render(): void {
		if (!this.currentExecutionState || !this.currentNodeName) return;

		this.container.empty();

		// Header
		const header = this.container.createDiv('execution-details-header');

		const title = header.createDiv('execution-details-title');
		title.createSpan({ text: '📊', cls: 'execution-details-icon' });
		title.createSpan({ text: 'Execution details', cls: 'execution-details-name' });

		const closeBtn = header.createEl('button', {
			text: '✕',
			cls: 'execution-details-close',
		});
		closeBtn.addEventListener('click', () => this.hide());

		// Create scrollable content wrapper
		const scrollContent = this.container.createDiv('execution-details-scroll-content');

		// Node info
		const nodeInfo = scrollContent.createDiv('execution-details-section');
		nodeInfo.createDiv('execution-details-section-title').setText('Node');
		const nodeInfoContent = nodeInfo.createDiv('execution-details-section-content');
		nodeInfoContent.createDiv('execution-details-node-name').setText(this.currentNodeName);

		// Status section
		const statusSection = scrollContent.createDiv('execution-details-section');
		statusSection.createDiv('execution-details-section-title').setText('Status');
		const statusContent = statusSection.createDiv('execution-details-section-content');

		const statusBadge = statusContent.createDiv('execution-details-status-badge');
		statusBadge.addClass(`status-${this.currentExecutionState.status}`);
		statusBadge.setText(this.getStatusText(this.currentExecutionState.status));

		// Metadata section
		if (this.currentExecutionState.startTime || this.currentExecutionState.duration) {
			const metadataSection = scrollContent.createDiv('execution-details-section');
			metadataSection.createDiv('execution-details-section-title').setText('Metadata');
			const metadataContent = metadataSection.createDiv('execution-details-section-content');
			const metadataGrid = metadataContent.createDiv('execution-details-metadata-grid');

			if (this.currentExecutionState.startTime) {
				const startTimeItem = metadataGrid.createDiv('execution-details-metadata-item');
				startTimeItem.createDiv('execution-details-metadata-label').setText('Start time');
				startTimeItem.createDiv('execution-details-metadata-value').setText(
					new Date(this.currentExecutionState.startTime).toLocaleString()
				);
			}

			if (this.currentExecutionState.endTime) {
				const endTimeItem = metadataGrid.createDiv('execution-details-metadata-item');
				endTimeItem.createDiv('execution-details-metadata-label').setText('End time');
				endTimeItem.createDiv('execution-details-metadata-value').setText(
					new Date(this.currentExecutionState.endTime).toLocaleString()
				);
			}

			if (this.currentExecutionState.duration !== undefined) {
				const durationItem = metadataGrid.createDiv('execution-details-metadata-item');
				durationItem.createDiv('execution-details-metadata-label').setText('Duration');
				durationItem.createDiv('execution-details-metadata-value').setText(
					`${this.currentExecutionState.duration}ms`
				);
			}
		}

		// Error section (if any)
		if (this.currentExecutionState.error) {
			const errorSection = scrollContent.createDiv('execution-details-section');
			errorSection.createDiv('execution-details-section-title').setText('Error');
			const errorContent = errorSection.createDiv('execution-details-section-content');
			const errorBox = errorContent.createDiv('execution-details-error-box');
			errorBox.setText(this.currentExecutionState.error);
		}

		// Input section
		if (this.currentExecutionState.input !== undefined) {
			const inputSection = scrollContent.createDiv('execution-details-section');
			inputSection.createDiv('execution-details-section-title').setText('Input');
			const inputContent = inputSection.createDiv('execution-details-section-content');
			this.renderData(inputContent, this.currentExecutionState.input);
		}

		// Output section
		if (this.currentExecutionState.output !== undefined) {
			const outputSection = scrollContent.createDiv('execution-details-section');
			outputSection.createDiv('execution-details-section-title').setText('Output');
			const outputContent = outputSection.createDiv('execution-details-section-content');
			this.renderData(outputContent, this.currentExecutionState.output);
		}
	}

	/**
	 * Render data (input or output)
	 */
	private renderData(container: HTMLElement, data: unknown): void {
		const dataBox = container.createDiv('execution-details-data-box');

		try {
			// Try to format as JSON
			const formatted = JSON.stringify(data, null, 2);
			const pre = dataBox.createEl('pre');
			pre.createEl('code').setText(formatted);
		} catch (_error) {
			// Fallback to string representation
			dataBox.setText(String(data));
		}
	}

	/**
	 * Get human-readable status text
	 */
	private getStatusText(status: NodeExecutionState['status']): string {
		const statusMap: Record<NodeExecutionState['status'], string> = {
			'pending': '⏳ Pending',
			'running': '▶️ Running',
			'success': '✅ Success',
			'completed': '✅ Completed',
			'error': '❌ Error',
		};
		return statusMap[status] || status;
	}

	/**
	 * Add event listener
	 */
	on<K extends keyof ExecutionDetailsPanelEvents>(
		event: K,
		handler: (data: ExecutionDetailsPanelEvents[K]) => void
	): void {
		this.events.on(event, handler);
	}

	/**
	 * Remove event listener
	 */
	off<K extends keyof ExecutionDetailsPanelEvents>(
		event: K,
		handler: (data: ExecutionDetailsPanelEvents[K]) => void
	): void {
		this.events.off(event, handler);
	}

	/**
	 * Destroy panel
	 */
	destroy(): void {
		this.events.clear();
		this.container.empty();
	}
}
