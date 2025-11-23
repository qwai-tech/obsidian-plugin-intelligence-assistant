/**
 * Workflow System V2 - Execution Info Modal
 *
 * Displays full execution details in a modal dialog.
 * Shows input, output, metadata (duration, timestamps), and errors.
 */

import { Modal } from 'obsidian';
import { NodeExecutionState } from '../core/types';

/**
 * Execution info modal - shows complete execution details
 */
export class ExecutionInfoModal extends Modal {
	private nodeId: string;
	private nodeName: string;
	private executionState: NodeExecutionState;

	constructor(
		app: never,
		nodeId: string,
		nodeName: string,
		executionState: NodeExecutionState
	) {
		super(app);
		this.nodeId = nodeId;
		this.nodeName = nodeName;
		this.executionState = executionState;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('execution-info-modal');

		// Header with node name
		const header = contentEl.createDiv('execution-info-modal-header');
		header.createSpan({ text: '📊', cls: 'execution-info-modal-icon' });
		header.createSpan({ text: `Execution Details - ${this.nodeName}`, cls: 'execution-info-modal-title' });

		// Content container
		const content = contentEl.createDiv('execution-info-modal-content');

		// Status section
		const statusSection = content.createDiv('execution-info-modal-section');
		statusSection.createDiv('execution-info-modal-section-title').setText('Status');
		const statusBadge = statusSection.createDiv('execution-info-modal-status-badge');
		statusBadge.addClass(`status-${this.executionState.status}`);
		statusBadge.setText(this.getStatusText(this.executionState.status));

		// Metadata section
		if (this.executionState.startTime || this.executionState.duration !== undefined) {
			const metadataSection = content.createDiv('execution-info-modal-section');
			metadataSection.createDiv('execution-info-modal-section-title').setText('Metadata');
			const metadataGrid = metadataSection.createDiv('execution-info-modal-metadata-grid');

			if (this.executionState.startTime) {
				const startTimeItem = metadataGrid.createDiv('execution-info-modal-metadata-item');
				startTimeItem.createDiv('execution-info-modal-metadata-label').setText('Start Time');
				startTimeItem.createDiv('execution-info-modal-metadata-value').setText(
					new Date(this.executionState.startTime).toLocaleString()
				);
			}

			if (this.executionState.endTime) {
				const endTimeItem = metadataGrid.createDiv('execution-info-modal-metadata-item');
				endTimeItem.createDiv('execution-info-modal-metadata-label').setText('End Time');
				endTimeItem.createDiv('execution-info-modal-metadata-value').setText(
					new Date(this.executionState.endTime).toLocaleString()
				);
			}

			if (this.executionState.duration !== undefined) {
				const durationItem = metadataGrid.createDiv('execution-info-modal-metadata-item');
				durationItem.createDiv('execution-info-modal-metadata-label').setText('Duration');
				durationItem.createDiv('execution-info-modal-metadata-value').setText(
					`${this.executionState.duration}ms`
				);
			}
		}

		// Error section
		if (this.executionState.error) {
			const errorSection = content.createDiv('execution-info-modal-section');
			errorSection.createDiv('execution-info-modal-section-title').setText('Error');
			const errorBox = errorSection.createDiv('execution-info-modal-error-box');
			errorBox.setText(this.executionState.error);
		}

		// Input section
		if (this.executionState.input !== undefined) {
			const inputSection = content.createDiv('execution-info-modal-section');
			inputSection.createDiv('execution-info-modal-section-title').setText('Input');
			this.renderData(inputSection, this.executionState.input);
		}

		// Output section
		if (this.executionState.output !== undefined) {
			const outputSection = content.createDiv('execution-info-modal-section');
			outputSection.createDiv('execution-info-modal-section-title').setText('Output');
			this.renderData(outputSection, this.executionState.output);
		}
	}

	/**
	 * Render data (input or output)
	 */
	private renderData(container: HTMLElement, data: unknown): void {
		const dataBox = container.createDiv('execution-info-modal-data-box');

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

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
