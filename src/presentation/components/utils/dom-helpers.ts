// DOM Helper utilities
export function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options?: {
    cls?: string;
    text?: string;
    attr?: Record<string, string>;
  }
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tagName);
  if (options?.cls) el.addClass(options.cls);
  if (options?.text) el.setText(options.text);
  if (options?.attr) {
    Object.entries(options.attr).forEach(([key, value]) => {
      el.setAttribute(key, value);
    });
  }
  return el;
}

export function addClickHandler(el: HTMLElement, handler: (e: MouseEvent) => void): void {
  el.addEventListener('click', handler);
}

export function showElement(el: HTMLElement): void {
  el.setCssProps({ 'display': '' });
}

export function hideElement(el: HTMLElement): void {
  el.addClass('ia-hidden');
}

export interface ButtonOptions {
	text?: string;
	title?: string;
	styles?: { variant?: 'ghost' | 'primary'; size?: 'sm' | 'md' | 'lg' };
	onClick?: (event: MouseEvent) => void;
}

export function createButton(parent: HTMLElement, options: ButtonOptions): HTMLButtonElement {
	const button = parent.createEl('button');
	button.setText(options.text ?? '');
	if (options.title) button.setAttr('title', options.title);
	button.addClass('ia-button');
	if (options.styles?.variant) button.addClass(`ia-button--${options.styles.variant}`);
	if (options.styles?.size) button.addClass(`ia-button--${options.styles.size}`);
	if (options.onClick) {
		button.addEventListener('click', options.onClick);
	}
	return button;
}

export function createControlContainer(parent: HTMLElement, className: string): HTMLElement {
	const container = parent.createDiv(className);
	container.addClass('ia-control-container');
	return container;
}

export function createLabel(parent: HTMLElement, text: string): HTMLElement {
	return parent.createSpan({ text, cls: 'ia-label' });
}

export function createBadge(parent: HTMLElement, text: string): HTMLElement {
	const badge = parent.createSpan('ia-badge');
	badge.setText(text);
	return badge;
}
