/**
 * Presentation utility helpers for rendering tables and status indicators.
 */

const TABLE_CLASS = 'ia-table';
const HEADER_ROW_CLASS = 'ia-table__header';
const CELL_CLASS = 'ia-table__cell';

export function createTable(containerEl: HTMLElement, headers: string[]): HTMLTableElement {
	const wrapper = containerEl.createDiv('ia-table-container');
	wrapper.addClass('ia-scrollable');

	const table = wrapper.createEl('table', { cls: TABLE_CLASS });
	const thead = table.createEl('thead');
	const headerRow = thead.createEl('tr', { cls: HEADER_ROW_CLASS });

	headers.forEach(headerText => {
		headerRow.createEl('th', { text: headerText, cls: CELL_CLASS });
	});

	table.createEl('tbody');
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
