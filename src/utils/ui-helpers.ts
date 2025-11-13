// UI Helper Utilities
import {Notice} from 'obsidian';

export function createTable(container: HTMLElement): HTMLTableElement {
  return container.createEl('table', {
    cls: 'ia-table'
  });
}

export function createStatusIndicator(container: HTMLElement, status: 'success' | 'error' | 'warning' | 'info', text?: string): HTMLElement {
  const el = container.createDiv({
    cls: `status-indicator status-${status}`,
    text: text || status
  });
  return el;
}

export function createTableHeader(table: HTMLTableElement, headers: string[]): HTMLTableRowElement {
  const headerRow = table.createEl('thead').createEl('tr');
  headers.forEach(header => {
    headerRow.createEl('th', { text: header });
  });
  return headerRow;
}

export function createTableRow(table: HTMLTableElement): HTMLTableRowElement {
  const tbody = table.createEl('tbody');
  return tbody.createEl('tr');
}

export function showNotice(message: string, duration: number = 5000): void {
  new Notice(message, duration);
}