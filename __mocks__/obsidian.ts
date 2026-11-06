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

export function requireApiVersion(_version: string): boolean {
	return true;
}

/** The handful of entities real search snippets emit, decoded in one pass. */
const HTML_ENTITIES: Record<string, string> = {
	'&nbsp;': ' ',
	'&amp;': '&',
	'&lt;': '<',
	'&gt;': '>',
	'&quot;': '"',
	'&#39;': "'",
};

/**
 * Decode entities with a SINGLE regex pass over the input. Chaining per-entity
 * `.replace()` calls would re-scan text produced by an earlier call, so
 * `&amp;lt;` would decode to `&` then to `<` — turning escaped markup back into
 * live markup. One pass leaves it as the literal `&lt;` the author wrote.
 */
function decodeEntities(text: string): string {
	return text.replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, entity => HTML_ENTITIES[entity]);
}

/**
 * Strip any tag-like markup, repeating until the string stops changing. A single
 * pass is incomplete: removing the inner match of `<<b>script>` leaves `<script>`
 * behind. Real htmlToMarkdown parses a DOM and has no such gap; the loop keeps
 * this stand-in from disagreeing with it on malformed input.
 */
function stripTags(text: string): string {
	let previous: string;
	let current = text;
	do {
		previous = current;
		current = current.replace(/<[^>]+>/g, '');
	} while (current !== previous);
	return current;
}

/**
 * Faithful-enough stand-in for Obsidian's htmlToMarkdown: converts the common
 * inline/block tags real search snippets use (<b>/<strong>, <i>/<em>, <a>,
 * <h1-3>, <br>, <p>) to markdown, strips any remaining tags, and decodes the
 * handful of HTML entities providers emit. Accepts a string (the only form the
 * web-search service passes).
 */
export function htmlToMarkdown(html: string | HTMLElement | Document | DocumentFragment): string {
	const raw = typeof html === 'string' ? html : (html as HTMLElement).innerHTML ?? '';
	const s = decodeEntities(stripTags(raw
		.replace(/<\s*(b|strong)\s*>(.*?)<\s*\/\s*\1\s*>/gis, '**$2**')
		.replace(/<\s*(i|em)\s*>(.*?)<\s*\/\s*\1\s*>/gis, '*$2*')
		.replace(/<\s*a\b[^>]*\bhref\s*=\s*["']([^"']*)["'][^>]*>(.*?)<\s*\/\s*a\s*>/gis, '[$2]($1)')
		.replace(/<\s*h1\s*>(.*?)<\s*\/\s*h1\s*>/gis, '# $1\n')
		.replace(/<\s*h2\s*>(.*?)<\s*\/\s*h2\s*>/gis, '## $1\n')
		.replace(/<\s*h3\s*>(.*?)<\s*\/\s*h3\s*>/gis, '### $1\n')
		.replace(/<\s*br\s*\/?\s*>/gi, '\n')
		.replace(/<\s*\/?\s*p\s*>/gi, '\n')));
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

	HTMLElement.prototype.createEl = function(tag: string, o?: string | { cls?: string | string[]; text?: string; attr?: Record<string, string>; type?: string; value?: string }) {
		const impl = function<K extends keyof HTMLElementTagNameMap>(
			this: HTMLElement,
			tagName: K,
			info?: string | { cls?: string | string[]; text?: string; attr?: Record<string, string>; type?: string; value?: string },
			callback?: (el: HTMLElementTagNameMap[K]) => void
		): HTMLElementTagNameMap[K] {
			const element = document.createElement(tagName) as HTMLElementTagNameMap[K];
			if (typeof info === 'string') {
				element.className = info;
			} else if (info && typeof info === 'object') {
				if (info.cls) element.className = Array.isArray(info.cls) ? info.cls.join(' ') : info.cls;
				if (info.text) element.textContent = info.text;
				if (info.type) element.setAttribute('type', info.type);
				if (info.value !== undefined) (element as unknown as { value: string }).value = info.value;
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

	// Obsidian also exposes detached DOM helpers on the host window.
	globalThis.createEl = (tag, options, callback) => {
		const host = document.createElement('div');
		const element = host.createEl(tag, options);
		element.remove();
		callback?.(element);
		return element;
	};
	globalThis.createDiv = (options, callback) => createEl('div', options, callback);
	globalThis.createSpan = (options, callback) => createEl('span', options, callback);
	globalThis.createFragment = (callback) => {
		const fragment = document.createDocumentFragment();
		callback?.(fragment);
		return fragment;
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
	secretStorage = {
		secrets: new Map<string, string>(),
		getSecret(id: string): string | null {
			return this.secrets.get(id) ?? null;
		},
		setSecret(id: string, secret: string): void {
			this.secrets.set(id, secret);
		},
		listSecrets(): string[] {
			return [...this.secrets.keys()];
		},
	};

	vault = {
		configDir: '.obsidian',
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

	onSelect(_cb: (value: T, evt: any) => void): this {
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

export class ItemView extends Component {
	app: App;
	leaf: unknown;
	containerEl: HTMLElement;
	constructor(leaf: { app?: App } = {}) {
		super();
		this.leaf = leaf;
		this.app = leaf.app ?? new App();
		this.containerEl = document.createElement('div');
	}
	registerDomEvent(): void {}
}

export class MarkdownView extends ItemView {
	file: TFile | null = null;
	editor: unknown = null;
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
	titleEl: HTMLElement;

	constructor(app: App) {
		this.app = app;
		this.contentEl = document.createElement('div');
		this.titleEl = document.createElement('div');
	}

	setTitle(title: string): this {
		this.titleEl.textContent = title;
		return this;
	}

	open(): void {}
	close(): void {}
	onOpen(): void {}
	onClose(): void {}
}

/**
 * Faithful-enough base for Obsidian's SuggestModal<T>: stores app, exposes an
 * inputEl + resultContainerEl, open/close, setPlaceholder/setInstructions, and a
 * test-friendly close() that records the open state.
 */
export abstract class SuggestModal<T> extends Modal {
	limit = 50;
	emptyStateText = 'No results.';
	inputEl: HTMLInputElement;
	resultContainerEl: HTMLElement;
	isOpen = false;

	constructor(app: App) {
		super(app);
		this.inputEl = document.createElement('input');
		this.resultContainerEl = document.createElement('div');
	}

	setPlaceholder(placeholder: string): void {
		this.inputEl.placeholder = placeholder;
	}
	setInstructions(_instructions: unknown[]): void {}
	onNoSuggestion(): void {}
	selectSuggestion(_value: T, _evt: MouseEvent | KeyboardEvent): void {}
	selectActiveSuggestion(_evt: MouseEvent | KeyboardEvent): void {}

	abstract getSuggestions(query: string): T[] | Promise<T[]>;
	abstract renderSuggestion(value: T, el: HTMLElement): void;
	abstract onChooseSuggestion(item: T, evt: MouseEvent | KeyboardEvent): void;

	open(): void {
		this.isOpen = true;
	}
	close(): void {
		this.isOpen = false;
	}
}

/**
 * Faithful-enough base for Obsidian's FuzzySuggestModal<T>. getSuggestions wraps
 * each item from getItems() (substring-filtered by query) into a FuzzyMatch, and
 * onChooseSuggestion delegates to onChooseItem — so a test can call getItems(),
 * getItemText(), and onChooseItem() directly, or drive selection through
 * getSuggestions()+onChooseSuggestion() exactly as Obsidian does.
 */
export abstract class FuzzySuggestModal<T> extends SuggestModal<{ item: T; match: { score: number; matches: unknown[] } }> {
	abstract getItems(): T[];
	abstract getItemText(item: T): string;
	abstract onChooseItem(item: T, evt: MouseEvent | KeyboardEvent): void;

	getSuggestions(query: string): Array<{ item: T; match: { score: number; matches: unknown[] } }> {
		const q = query.toLowerCase();
		return this.getItems()
			.filter((item) => this.getItemText(item).toLowerCase().includes(q))
			.map((item) => ({ item, match: { score: 0, matches: [] } }));
	}

	renderSuggestion(item: { item: T }, el: HTMLElement): void {
		el.setText(this.getItemText(item.item));
	}

	onChooseSuggestion(item: { item: T }, evt: MouseEvent | KeyboardEvent): void {
		this.onChooseItem(item.item, evt);
	}
}

/**
 * Faithful-enough stand-in for Obsidian's loadMermaid(): resolves a mermaid-shaped
 * module whose render(id, code) resolves to { svg } containing a real <svg> string
 * that embeds the source so tests can assert the diagram was produced.
 */
export const loadMermaid = jest.fn(async () => {
	return {
		initialize: jest.fn(),
		render: jest.fn(async (id: string, code: string) => ({
			svg: `<svg data-mermaid-id="${id}" xmlns="http://www.w3.org/2000/svg"><text>${code}</text></svg>`,
		})),
	};
});

/** Stand-in for Obsidian's loadMathJax(): resolves a truthy module. */
export const loadMathJax = jest.fn(async () => ({ tex2chtml: jest.fn() }));

export const renderMath = jest.fn((source: string, display: boolean): HTMLElement => {
	const el = document.createElement(display ? 'div' : 'span');
	el.className = 'math';
	el.setAttribute('data-tex', source);
	el.setAttribute('data-display', String(display));
	return el;
});

export const finishRenderMath = jest.fn(async () => undefined);

/** Stand-in for Obsidian's loadPrism(): resolves a truthy Prism module. */
export const loadPrism = jest.fn(async () => ({
	highlightAll: jest.fn(),
	highlightElement: jest.fn(),
	languages: {} as Record<string, unknown>,
}));

export class HoverPopover extends Component {
	hoverEl: HTMLElement;
	constructor(_parent: unknown, _targetEl: HTMLElement | null) {
		super();
		this.hoverEl = document.createElement('div');
	}
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

export function getIcon(iconId: string): SVGSVGElement | null {
	return /^[a-z][a-z0-9-]*$/.test(iconId) ? document.createElementNS('http://www.w3.org/2000/svg', 'svg') : null;
}

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
export const Keymap = {
	isModEvent: (event?: MouseEvent | KeyboardEvent | null): boolean => Boolean(event && (event.metaKey || event.ctrlKey)),
};

export const Platform = {
	isMobile: false,
	isDesktop: true,
};

class ValueComponent<T> {
	value!: T;
	placeholder = '';
	private handler?: (value: T) => unknown;

	setValue(value: T): this {
		this.value = value;
		return this;
	}

	getValue(): T {
		return this.value;
	}

	setPlaceholder(placeholder: string): this {
		this.placeholder = placeholder;
		return this;
	}

	onChange(handler: (value: T) => unknown): this {
		this.handler = handler;
		return this;
	}

	async change(value: T): Promise<void> {
		this.value = value;
		await this.handler?.(value);
	}
}

export class ToggleComponent extends ValueComponent<boolean> {
	toggleEl = document.createElement('div');
}

export class TextComponent extends ValueComponent<string> {
	inputEl = document.createElement('input');
}

export class TextAreaComponent extends ValueComponent<string> {
	inputEl = document.createElement('textarea');
}

export class SecretComponent extends ValueComponent<string | null> {
	constructor(public app: App, public containerEl: HTMLElement) {
		super();
	}
}

export class DropdownComponent extends ValueComponent<string> {
	selectEl = document.createElement('select');
	options: Record<string, string> = {};

	addOption(value: string, label: string): this {
		this.options[value] = label;
		return this;
	}

	addOptions(options: Record<string, string>): this {
		Object.assign(this.options, options);
		return this;
	}
}

export class ButtonComponent {
	buttonEl = document.createElement('button');

	constructor(containerEl?: HTMLElement) {
		containerEl?.appendChild(this.buttonEl);
	}

	setButtonText(text: string): this {
		this.buttonEl.textContent = text;
		return this;
	}

	setCta(): this {
		this.buttonEl.classList.add('mod-cta');
		return this;
	}

	setWarning(): this {
		this.buttonEl.classList.add('mod-warning');
		return this;
	}

	setDestructive(): this {
		return this.setWarning();
	}

	setTooltip(tooltip: string): this {
		this.buttonEl.setAttribute('aria-label', tooltip);
		return this;
	}

	setDisabled(disabled: boolean): this {
		this.buttonEl.disabled = disabled;
		return this;
	}

	onClick(handler: (event: MouseEvent) => unknown): this {
		this.buttonEl.addEventListener('click', (event) => { void handler(event); });
		return this;
	}
}

export class Setting {
	settingEl: HTMLElement;
	nameEl: HTMLElement;
	descEl: HTMLElement;
	controlEl: HTMLElement;
	components: Array<ValueComponent<unknown>> = [];

	constructor(containerEl: HTMLElement) {
		this.settingEl = containerEl.createDiv('setting-item');
		this.nameEl = this.settingEl.createDiv('setting-item-name');
		this.descEl = this.settingEl.createDiv('setting-item-description');
		this.controlEl = this.settingEl.createDiv('setting-item-control');
	}

	setName(name: string): this {
		this.nameEl.textContent = name;
		return this;
	}

	setDesc(desc: string): this {
		this.descEl.textContent = desc;
		return this;
	}

	setHeading(): this {
		this.settingEl.addClass('setting-item-heading');
		return this;
	}

	addToggle(build: (component: ToggleComponent) => unknown): this {
		return this.add(new ToggleComponent(), build);
	}

	addText(build: (component: TextComponent) => unknown): this {
		return this.add(new TextComponent(), build);
	}

	addTextArea(build: (component: TextAreaComponent) => unknown): this {
		return this.add(new TextAreaComponent(), build);
	}

	addDropdown(build: (component: DropdownComponent) => unknown): this {
		return this.add(new DropdownComponent(), build);
	}

	addButton(build: (component: ButtonComponent) => unknown): this {
		build(new ButtonComponent(this.controlEl));
		return this;
	}

	addComponent<C>(build: (el: HTMLElement) => C): this {
		this.components.push(build(this.controlEl) as unknown as ValueComponent<unknown>);
		return this;
	}

	private add<C>(component: C, build: (component: C) => unknown): this {
		this.components.push(component as unknown as ValueComponent<unknown>);
		build(component);
		return this;
	}
}

export class PluginSettingTab {
	containerEl: HTMLElement = document.createElement('div');
	constructor(public app: App, public plugin: unknown) {}
}

export abstract class SettingPage {
	rootEl: HTMLElement = document.createElement('div');
	titlebarEl: HTMLElement = document.createElement('div');
	containerEl: HTMLElement = document.createElement('div');
	title = '';
	abstract display(): void;
	hide(): void {}
}
