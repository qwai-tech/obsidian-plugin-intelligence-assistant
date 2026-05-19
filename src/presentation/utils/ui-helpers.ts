/**
 * Presentation utility helpers for rendering tables and status indicators.
 */

export function createTable(containerEl: HTMLElement, headers: string[]): HTMLTableElement {
	const wrapper = containerEl.createDiv('ia-table-container');
	wrapper.addClass('ia-scrollable');

	const table = wrapper.createEl('table', { cls: 'ia-table' });

	const thead = table.createEl('thead', { cls: 'ia-table-head' });
	const headerRow = thead.createEl('tr');
	headers.forEach(headerText => {
		headerRow.createEl('th', { text: headerText, cls: 'ia-table-header' });
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
