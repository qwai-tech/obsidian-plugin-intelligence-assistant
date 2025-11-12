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
	btn.style.padding = options.styles?.size === 'sm' ? '4px 8px' : '6px 12px';
	btn.style.borderRadius = '4px';
	btn.style.border = '1px solid var(--background-modifier-border)';
	btn.style.cursor = 'pointer';
	btn.style.fontSize = options.styles?.size === 'sm' ? '11px' : '13px';

	// Apply variant styles
	switch (options.styles?.variant) {
		case 'primary':
			btn.style.background = 'var(--interactive-accent)';
			btn.style.color = 'var(--text-on-accent)';
			btn.style.fontWeight = '500';
			break;
		case 'danger':
			btn.style.background = 'var(--background-modifier-error)';
			btn.style.color = 'var(--text-error)';
			break;
		case 'ghost':
		default:
			btn.style.background = 'var(--background-primary)';
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

	select.style.padding = '6px 10px';
	select.style.borderRadius = '4px';
	select.style.border = '1px solid var(--background-modifier-border)';
	select.style.background = 'var(--background-primary)';
	select.style.color = 'var(--text-normal)';
	select.style.fontSize = '13px';
	select.style.cursor = 'pointer';

	if (options.styles?.flex) select.style.flex = options.styles.flex;
	if (options.styles?.width) select.style.width = options.styles.width;

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

	container.style.display = 'flex';
	container.style.flexDirection = options?.direction === 'column' ? 'column' : 'row';
	container.style.gap = options?.gap || '8px';
	if (options?.align) container.style.alignItems = options.align;
	if (options?.flex) container.style.flex = options.flex;

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

	label.style.fontWeight = options?.weight || '500';
	label.style.fontSize = '13px';

	switch (options?.variant) {
		case 'muted':
			label.style.color = 'var(--text-muted)';
			break;
		case 'accent':
			label.style.color = 'var(--text-accent)';
			break;
		default:
			label.style.color = 'var(--text-normal)';
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

	badge.style.fontSize = options?.size === 'sm' ? '11px' : '12px';
	badge.style.padding = options?.size === 'sm' ? '2px 6px' : '4px 8px';
	badge.style.borderRadius = '4px';
	badge.style.fontWeight = '500';

	switch (options?.variant) {
		case 'success':
			badge.style.background = 'var(--background-modifier-success)';
			badge.style.color = 'var(--text-success)';
			break;
		case 'warning':
			badge.style.background = 'var(--background-modifier-warning)';
			badge.style.color = 'var(--text-warning)';
			break;
		case 'error':
			badge.style.background = 'var(--background-modifier-error)';
			badge.style.color = 'var(--text-error)';
			break;
		default:
			badge.style.background = 'var(--background-primary)';
			badge.style.color = 'var(--text-muted)';
	}

	return badge;
}
