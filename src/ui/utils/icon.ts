import { getIcon, setIcon } from 'obsidian';

export function isIconId(icon: string | undefined): boolean {
	return Boolean(icon && getIcon(icon));
}

export function renderIcon(el: HTMLElement, icon: string | undefined, fallback = 'bot'): void {
	el.empty();
	if (icon && isIconId(icon)) {
		setIcon(el, icon);
	} else if (icon) {
		el.setText(icon);
	} else {
		setIcon(el, fallback);
	}
}
