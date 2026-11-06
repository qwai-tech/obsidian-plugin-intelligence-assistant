import type { ButtonComponent } from 'obsidian';

/**
 * Presentation utility helpers for rendering tables and status indicators.
 */

export function createTable(containerEl: HTMLElement, headers: string[], options: { numericColumns?: number } = {}): HTMLTableElement {
	const wrapper = containerEl.createDiv('ia-table-container');
	wrapper.addClass('ia-scrollable');

	const table = wrapper.createEl('table', { cls: 'ia-table' });

	const thead = table.createEl('thead', { cls: 'ia-table-head' });
	const headerRow = thead.createEl('tr');
	const firstNumeric = headers.length - (options.numericColumns ?? 0);
	headers.forEach((headerText, index) => {
		const header = headerRow.createEl('th', { text: headerText, cls: 'ia-table-header' });
		header.toggleClass('ia-table-cell--right', index >= firstNumeric);
	});

	table.createEl('tbody', { cls: 'ia-table-body' });
	return table;
}

export type StatusKind = 'success' | 'warning' | 'error' | 'info';

export function createStatusIndicator(host: HTMLElement, status: StatusKind, label: string): HTMLElement {
	const indicator = host.createDiv('ia-status-indicator');
	indicator.addClass(`is-${status}`);

	const dot = indicator.createSpan('ia-status-indicator__dot');
	dot.setAttr('aria-hidden', 'true');

	indicator.createSpan({ text: label, cls: 'ia-status-indicator__label' });
	return indicator;
}

/** Style a destructive action using the supported minimum Obsidian 1.13 API. */
export function setDestructiveButton(button: ButtonComponent): ButtonComponent {
	return button.setDestructive();
}
