/**
 * DOM Helper Utilities
 * Reduces inline styling by providing reusable DOM element creators
 */

export interface ButtonStyles {
	variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
	size?: 'sm' | 'md' | 'lg';
	icon?: string;
}

export interface ControlStyles {
	flex?: string;
	width?: string;
	gap?: string;
}

/**
 * Creates a styled button element
 */
export function createButton(
	parent: HTMLElement,
	options: {
		text?: string;
		title?: string;
		cls?: string;
		styles?: ButtonStyles;
		onClick?: (e: MouseEvent) => void;
	}
): HTMLButtonElement {
	const btn = parent.createEl('button', { text: options.text || '', cls: options.cls });

	if (options.title) btn.title = options.title;

	// Apply base styles
	btn.setCssProps({ 'padding': options.styles?.size === 'sm' ? '4px 8px' : '6px 12px' });
	btn.setCssProps({ 'border-radius': '4px' });
	btn.setCssProps({ 'border': '1px solid var(--background-modifier-border)' });
	btn.addClass('ia-clickable');
	btn.setCssProps({ 'font-size': options.styles?.size === 'sm' ? '11px' : '13px' });

	// Apply variant styles
	switch (options.styles?.variant) {
		case 'primary':
			btn.setCssProps({ 'background': 'var(--interactive-accent)' });
			btn.setCssProps({ 'color': 'var(--text-on-accent)' });
			btn.setCssProps({ 'font-weight': '500' });
			break;
		case 'danger':
			btn.setCssProps({ 'background': 'var(--background-modifier-error)' });
			btn.setCssProps({ 'color': 'var(--text-error)' });
			break;
		case 'ghost':
		default:
			btn.setCssProps({ 'background': 'var(--background-primary)' });
			break;
	}

	if (options.onClick) {
		btn.addEventListener('click', options.onClick);
	}

	return btn;
}

/**
 * Creates a styled select element
 */
export function createSelect(
	parent: HTMLElement,
	options: {
		cls?: string;
		styles?: ControlStyles;
		onChange?: (value: string) => void;
	}
): HTMLSelectElement {
	const select = parent.createEl('select', { cls: options.cls });

	select.setCssProps({ 'padding': '6px 10px' });
	select.setCssProps({ 'border-radius': '4px' });
	select.setCssProps({ 'border': '1px solid var(--background-modifier-border)' });
	select.setCssProps({ 'background': 'var(--background-primary)' });
	select.setCssProps({ 'color': 'var(--text-normal)' });
	select.setCssProps({ 'font-size': '13px' });
	select.addClass('ia-clickable');

	if (options.styles?.flex) select.setCssProps({ 'flex': options.styles.flex });
	if (options.styles?.width) select.setCssProps({ 'width': options.styles.width });

	if (options.onChange) {
		select.addEventListener('change', (e) => {
			options.onChange!((e.target as HTMLSelectElement).value);
		});
	}

	return select;
}

/**
 * Creates a control container with flex layout
 */
export function createControlContainer(
	parent: HTMLElement,
	options?: {
		cls?: string;
		direction?: 'row' | 'column';
		gap?: string;
		align?: string;
		flex?: string;
	}
): HTMLDivElement {
	const container = parent.createDiv(options?.cls);

	container.removeClass('ia-hidden');
	container.setCssProps({ 'flex-direction': options?.direction === 'column' ? 'column' : 'row' });
	container.setCssProps({ 'gap': options?.gap || '8px' });
	if (options?.align) container.setCssProps({ 'align-items': options.align });
	if (options?.flex) container.setCssProps({ 'flex': options.flex });

	return container;
}

/**
 * Creates a label span with consistent styling
 */
export function createLabel(
	parent: HTMLElement,
	text: string,
	options?: {
		variant?: 'normal' | 'muted' | 'accent';
		weight?: string;
	}
): HTMLSpanElement {
	const label = parent.createSpan({ text });

	label.setCssProps({ 'font-weight': options?.weight || '500' });
	label.setCssProps({ 'font-size': '13px' });

	switch (options?.variant) {
		case 'muted':
			label.setCssProps({ 'color': 'var(--text-muted)' });
			break;
		case 'accent':
			label.setCssProps({ 'color': 'var(--text-accent)' });
			break;
		default:
			label.setCssProps({ 'color': 'var(--text-normal)' });
	}

	return label;
}

/**
 * Creates an info badge/pill element
 */
export function createBadge(
	parent: HTMLElement,
	text: string,
	options?: {
		variant?: 'info' | 'success' | 'warning' | 'error';
		size?: 'sm' | 'md';
	}
): HTMLSpanElement {
	const badge = parent.createSpan({ text });

	badge.setCssProps({ 'font-size': options?.size === 'sm' ? '11px' : '12px' });
	badge.setCssProps({ 'padding': options?.size === 'sm' ? '2px 6px' : '4px 8px' });
	badge.setCssProps({ 'border-radius': '4px' });
	badge.setCssProps({ 'font-weight': '500' });

	switch (options?.variant) {
		case 'success':
			badge.setCssProps({ 'background': 'var(--background-modifier-success)' });
			badge.setCssProps({ 'color': 'var(--text-success)' });
			break;
		case 'warning':
			badge.setCssProps({ 'background': 'var(--background-modifier-warning)' });
			badge.setCssProps({ 'color': 'var(--text-warning)' });
			break;
		case 'error':
			badge.setCssProps({ 'background': 'var(--background-modifier-error)' });
			badge.setCssProps({ 'color': 'var(--text-error)' });
			break;
		default:
			badge.setCssProps({ 'background': 'var(--background-primary)' });
			badge.setCssProps({ 'color': 'var(--text-muted)' });
	}

	return badge;
}
