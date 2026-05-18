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
	btn.addClass('ia-dom-btn');
	btn.addClass('ia-clickable');
	btn.toggleClass('ia-dom-btn--sm', options.styles?.size === 'sm');

	// Apply variant styles
	switch (options.styles?.variant) {
		case 'primary':
			btn.addClass('ia-dom-btn--primary');
			break;
		case 'danger':
			btn.addClass('ia-dom-btn--danger');
			break;
		case 'ghost':
		default:
			btn.addClass('ia-dom-btn--ghost');
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

	select.addClass('ia-dom-select');
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
	container.toggleClass('ia-flex-col', options?.direction === 'column');
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

	label.addClass('ia-dom-label');
	if (options?.weight && options.weight !== '500') {
		label.setCssProps({ 'font-weight': options.weight });
	}

	switch (options?.variant) {
		case 'muted':
			label.addClass('ia-dom-label--muted');
			break;
		case 'accent':
			label.addClass('ia-dom-label--accent');
			break;
		default:
			label.addClass('ia-dom-label--normal');
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

	badge.addClass('ia-dom-badge');
	badge.toggleClass('ia-dom-badge--sm', options?.size === 'sm');

	switch (options?.variant) {
		case 'success':
			badge.addClass('ia-dom-badge--success');
			break;
		case 'warning':
			badge.addClass('ia-dom-badge--warning');
			break;
		case 'error':
			badge.addClass('ia-dom-badge--error');
			break;
		default:
			// default styles already applied by ia-dom-badge
			break;
	}

	return badge;
}
