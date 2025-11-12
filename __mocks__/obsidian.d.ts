/**
 * Type definitions for Obsidian API extensions used in tests
 */

declare global {
	interface HTMLElement {
		empty(): void;
		createDiv(cls?: string | { cls?: string; text?: string; attr?: Record<string, string> }): HTMLDivElement;
		createEl(tag: string, o?: string | { cls?: string; text?: string; attr?: Record<string, string> }): HTMLElement;
		createSpan(cls?: string | { cls?: string; text?: string; attr?: Record<string, string> }): HTMLSpanElement;
		setText(text: string): void;
		addClass(cls: string): void;
		removeClass(cls: string): void;
		toggleClass(cls: string, state?: boolean): void;
	}
}

export {};
