/**
 * Mock Obsidian API for testing
 * Provides minimal implementations of Obsidian classes needed for tests
 */

import { jest } from '@jest/globals';

// Add Obsidian HTMLElement extensions
if (typeof HTMLElement !== 'undefined') {
	HTMLElement.prototype.empty = function() {
		this.innerHTML = '';
	};

	HTMLElement.prototype.createDiv = function(cls?: string | { cls?: string; text?: string; attr?: Record<string, string> }) {
		const div = document.createElement('div');
		if (typeof cls === 'string') {
			div.className = cls;
		} else if (cls && typeof cls === 'object') {
			if (cls.cls) div.className = cls.cls;
			if (cls.text) div.textContent = cls.text;
			if (cls.attr) {
				Object.entries(cls.attr).forEach(([key, value]) => {
					div.setAttribute(key, value);
				});
			}
		}
		this.appendChild(div);
		return div;
	};

	HTMLElement.prototype.createEl = function(tag: string, o?: string | { cls?: string; text?: string; attr?: Record<string, string> }) {
		const impl = function<K extends keyof HTMLElementTagNameMap>(
			this: HTMLElement,
			tagName: K,
			info?: string | { cls?: string; text?: string; attr?: Record<string, string> },
			callback?: (el: HTMLElementTagNameMap[K]) => void
		): HTMLElementTagNameMap[K] {
			const element = document.createElement(tagName) as HTMLElementTagNameMap[K];
			if (typeof info === 'string') {
				element.className = info;
			} else if (info && typeof info === 'object') {
				if (info.cls) element.className = info.cls;
				if (info.text) element.textContent = info.text;
				if (info.attr) {
					Object.entries(info.attr).forEach(([key, value]) => {
						element.setAttribute(key, value);
					});
				}
			}
			this.appendChild(element);
			callback?.(element);
			return element;
		} as typeof HTMLElement.prototype.createEl;

		return impl.call(this, tag, o);
	};

	HTMLElement.prototype.createSpan = function(cls?: string | { cls?: string; text?: string; attr?: Record<string, string> }) {
		const span = document.createElement('span');
		if (typeof cls === 'string') {
			span.className = cls;
		} else if (cls && typeof cls === 'object') {
			if (cls.cls) span.className = cls.cls;
			if (cls.text) span.textContent = cls.text;
			if (cls.attr) {
				Object.entries(cls.attr).forEach(([key, value]) => {
					span.setAttribute(key, value);
				});
			}
		}
		this.appendChild(span);
		return span;
	};

	HTMLElement.prototype.setText = function(text: string) {
		this.textContent = text;
	};

	HTMLElement.prototype.addClass = function(cls: string) {
		this.classList.add(cls);
	};

	HTMLElement.prototype.removeClass = function(cls: string) {
		this.classList.remove(cls);
	};

	HTMLElement.prototype.toggleClass = function(cls: string, state?: boolean) {
		this.classList.toggle(cls, state);
	};
}

export class Events {
	private handlers: Map<string, Function[]> = new Map();

	on(eventName: string, handler: Function): void {
		if (!this.handlers.has(eventName)) {
			this.handlers.set(eventName, []);
		}
		this.handlers.get(eventName)!.push(handler);
	}

	off(eventName: string, handler: Function): void {
		const handlers = this.handlers.get(eventName);
		if (handlers) {
			const index = handlers.indexOf(handler);
			if (index > -1) {
				handlers.splice(index, 1);
			}
		}
	}

	trigger(eventName: string, ...args: any[]): void {
		const handlers = this.handlers.get(eventName);
		if (handlers) {
			handlers.forEach(handler => handler(...args));
		}
	}
}

export class App {
	vault = {
		getMarkdownFiles: jest.fn(() => []),
		getFiles: jest.fn(() => []),
		read: jest.fn(async () => ''),
		readBinary: jest.fn(async () => new ArrayBuffer(0)),
		getAbstractFileByPath: jest.fn(() => null),
	};

	workspace = {
		getLeaf: jest.fn(() => ({
			openFile: jest.fn(),
		})),
	};

	fileManager = {
		trashFile: jest.fn(async (_file: any) => {}),
	};
}

export class Modal {
	app: App;
	contentEl: HTMLElement;

	constructor(app: App) {
		this.app = app;
		this.contentEl = document.createElement('div');
	}

	open(): void {}
	close(): void {}
	onOpen(): void {}
	onClose(): void {}
}

export class Menu {
	items: any[] = [];

	addItem(callback: (item: any) => void): this {
		const item = {
			setTitle: jest.fn().mockReturnThis(),
			setIcon: jest.fn().mockReturnThis(),
			onClick: jest.fn().mockReturnThis(),
		};
		callback(item);
		this.items.push(item);
		return this;
	}

	showAtMouseEvent(event: MouseEvent): void {}
	showAtPosition(position: { x: number; y: number }): void {}
}

export class Notice {
	constructor(message: string) {}
}

export class TFile {
	path: string = '';
	name: string = '';
	basename: string = '';
	extension: string = '';
	vault: any = null;
	parent: any = null;
	stat: { ctime: number; mtime: number; size: number } = { ctime: 0, mtime: 0, size: 0 };
}

export class TFolder {
	path: string = '';
	name: string = '';
	vault: any = null;
	parent: any = null;
	children: any[] = [];
}

export const requestUrl = jest.fn(async (options: any) => {
	return {
		status: 200,
		headers: {},
		json: {},
		text: '',
		arrayBuffer: new ArrayBuffer(0),
	};
});

// Export additional mocks as needed
export const Platform = {
	isMobile: false,
	isDesktop: true,
};
