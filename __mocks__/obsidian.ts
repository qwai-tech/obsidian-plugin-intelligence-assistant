/**
 * Mock Obsidian API for testing
 * Provides minimal implementations of Obsidian classes needed for tests
 */

import { jest } from '@jest/globals';
import * as YAML from 'yaml';

// Obsidian's stringifyYaml/parseYaml wrap the `yaml` package; mirror that here.
export function stringifyYaml(obj: unknown): string {
	return YAML.stringify(obj);
}

export function parseYaml(raw: string): unknown {
	return YAML.parse(raw);
}

/**
 * Faithful-enough stand-in for Obsidian's htmlToMarkdown: converts the common
 * inline/block tags real search snippets use (<b>/<strong>, <i>/<em>, <a>,
 * <h1-3>, <br>, <p>) to markdown, strips any remaining tags, and decodes the
 * handful of HTML entities providers emit. Accepts a string (the only form the
 * web-search service passes).
 */
export function htmlToMarkdown(html: string | HTMLElement | Document | DocumentFragment): string {
	let s = typeof html === 'string' ? html : (html as HTMLElement).innerHTML ?? '';
	s = s
		.replace(/<\s*(b|strong)\s*>(.*?)<\s*\/\s*\1\s*>/gis, '**$2**')
		.replace(/<\s*(i|em)\s*>(.*?)<\s*\/\s*\1\s*>/gis, '*$2*')
		.replace(/<\s*a\b[^>]*\bhref\s*=\s*["']([^"']*)["'][^>]*>(.*?)<\s*\/\s*a\s*>/gis, '[$2]($1)')
		.replace(/<\s*h1\s*>(.*?)<\s*\/\s*h1\s*>/gis, '# $1\n')
		.replace(/<\s*h2\s*>(.*?)<\s*\/\s*h2\s*>/gis, '## $1\n')
		.replace(/<\s*h3\s*>(.*?)<\s*\/\s*h3\s*>/gis, '### $1\n')
		.replace(/<\s*br\s*\/?\s*>/gi, '\n')
		.replace(/<\s*\/?\s*p\s*>/gi, '\n')
		.replace(/<[^>]+>/g, '');
	s = s
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
	return s.replace(/\n{3,}/g, '\n\n').trim();
}

// Add Obsidian HTMLElement extensions
if (typeof HTMLElement !== 'undefined') {
	// Obsidian augments Node with a cross-window-safe instanceOf(); mirror it so
	// code using `el.instanceOf(SVGElement)` works under jsdom (single window).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(Node.prototype as any).instanceOf = function (type: new (...args: any[]) => unknown): boolean {
		return this instanceof type;
	};

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

	HTMLElement.prototype.setAttr = function(name: string, value: string) {
		this.setAttribute(name, value);
	};

	HTMLElement.prototype.setCssProps = function(props: Record<string, string>) {
		Object.entries(props).forEach(([key, value]) => {
			this.style.setProperty(key, value);
		});
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

	metadataCache = {
		getFileCache: jest.fn((_file: any) => null as any),
		getFirstLinkpathDest: jest.fn((_linkpath: string, _sourcePath: string) => null as any),
	};

	fileManager = {
		trashFile: jest.fn(async (_file: any) => {}),
		// Faithful-enough stand-in for Obsidian's link generator: defaults to a
		// wikilink, appends a #subpath and |alias when provided.
		generateMarkdownLink: jest.fn(
			(file: any, _sourcePath: string, subpath?: string, alias?: string) => {
				const base = file?.basename ?? file?.name ?? '';
				const target = subpath ? `${base}${subpath}` : base;
				return alias ? `[[${target}|${alias}]]` : `[[${target}]]`;
			},
		),
	};
}

/**
 * Minimal faithful stand-in for Obsidian's loadPdfJs(): returns a pdf.js-shaped
 * module whose getDocument(...).promise resolves to a doc with numPages /
 * getPage / getTextContent().items[].str. Backed by the ArrayBuffer's bytes so
 * tests can encode known text.
 */
export const loadPdfJs = jest.fn(async () => {
	return {
		getDocument({ data }: { data: ArrayBuffer | Uint8Array }) {
			const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
			const decoded = new TextDecoder().decode(bytes);
			// Test fixtures encode pages as text separated by the form-feed char.
			const pages = decoded.length ? decoded.split('\f') : [''];
			return {
				promise: Promise.resolve({
					numPages: pages.length,
					async getPage(pageNum: number) {
						const text = pages[pageNum - 1] ?? '';
						return {
							async getTextContent() {
								return {
									items: text
										.split(' ')
										.filter((s) => s.length > 0)
										.map((str) => ({ str })),
								};
							},
						};
					},
				}),
			};
		},
	};
});

/** Faithful getAllTags: collects #frontmatter tags + inline cache.tags[].tag. */
export function getAllTags(cache: any): string[] | null {
	if (!cache) return null;
	const out = new Set<string>();
	const fmTags = cache.frontmatter?.tags;
	const fmList = Array.isArray(fmTags) ? fmTags : fmTags ? [fmTags] : [];
	for (const t of fmList) {
		const s = String(t);
		out.add(s.startsWith('#') ? s : `#${s}`);
	}
	for (const entry of cache.tags ?? []) {
		if (entry?.tag) out.add(entry.tag.startsWith('#') ? entry.tag : `#${entry.tag}`);
	}
	return [...out];
}

/** Faithful parseLinktext: splits a wikilink into path + (#)subpath. */
export function parseLinktext(linktext: string): { path: string; subpath: string } {
	const hash = linktext.indexOf('#');
	if (hash < 0) return { path: linktext, subpath: '' };
	return { path: linktext.slice(0, hash), subpath: linktext.slice(hash) };
}

/**
 * Faithful-enough resolveSubpath: finds a matching heading in cache.headings
 * and returns its start/end offsets (end = next heading's start, or null).
 */
export function resolveSubpath(cache: any, subpath: string): any {
	const name = subpath.replace(/^#+/, '').trim();
	const headings = cache?.headings ?? [];
	const idx = headings.findIndex((h: any) => h.heading === name);
	if (idx < 0) return null;
	const start = headings[idx].position?.start ?? { offset: 0 };
	const end = headings[idx + 1]?.position?.start ?? null;
	return { start, end };
}

/**
 * Faithful-enough base for AbstractInputSuggest used by the chat @-mention
 * suggester. Stores app + the bound input element, exposes value get/set against
 * that element, and provides a no-op close()/onSelect() so the suggester can be
 * instantiated and exercised in unit tests.
 */
export abstract class PopoverSuggest<T> {
	app: App;
	constructor(app: App) {
		this.app = app;
	}
	abstract renderSuggestion(value: T, el: HTMLElement): void;
	abstract selectSuggestion(value: T, evt: any): void;
	open(): void {}
	close(): void {}
}

export abstract class AbstractInputSuggest<T> extends PopoverSuggest<T> {
	limit = 100;
	protected textInputEl: HTMLInputElement | HTMLDivElement;
	private selectCb: ((value: T, evt: any) => void) | null = null;

	constructor(app: App, textInputEl: HTMLInputElement | HTMLDivElement) {
		super(app);
		this.textInputEl = textInputEl;
	}

	protected abstract getSuggestions(query: string): T[] | Promise<T[]>;

	setValue(value: string): void {
		(this.textInputEl as HTMLInputElement).value = value;
	}

	getValue(): string {
		return (this.textInputEl as HTMLInputElement).value ?? '';
	}

	onSelect(cb: (value: T, evt: any) => void): this {
		this.selectCb = cb;
		return this;
	}

	// Test helper: surface the protected getSuggestions through a public path.
	async _getSuggestionsForTest(query: string): Promise<T[]> {
		return await this.getSuggestions(query);
	}
}

export class Component {
	registerEvent(): void {}
	register(): void {}
	load(): void {}
	unload(): void {}
	onload(): void {}
	onunload(): void {}
	addChild<T extends Component>(child: T): T { return child; }
	removeChild<T extends Component>(child: T): T { return child; }
}

export class MarkdownRenderChild extends Component {
	containerEl: HTMLElement;
	constructor(containerEl: HTMLElement) {
		super();
		this.containerEl = containerEl;
	}
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

export const Menu = jest.fn().mockImplementation(() => {
	const menu = {
		items: [] as any[],
		addItem: jest.fn((callback: (item: any) => void) => {
			const item = {
				setTitle: jest.fn().mockReturnThis(),
				setIcon: jest.fn().mockReturnThis(),
				onClick: jest.fn().mockReturnThis(),
			};
			callback(item);
			menu.items.push(item);
			return menu;
		}),
		showAtMouseEvent: jest.fn(),
		showAtPosition: jest.fn(),
	};
	return menu;
});

export const Notice = jest.fn().mockImplementation((_message: string) => {});

export function setIcon(el: HTMLElement, iconId: string): void {
	const icon = document.createElement('span');
	icon.className = 'mock-icon';
	icon.setAttribute('data-icon', iconId);
	el.appendChild(icon);
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

export function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\//, '');
}

export function getLanguage(): string {
	return 'en';
}

// Export additional mocks as needed
export const Platform = {
	isMobile: false,
	isDesktop: true,
};
