import { EditorQuickActions } from '@/ui/editor/editor-quick-actions';

import { reviewReplacement } from '@/ui/modals/replacement-preview-modal';

jest.mock('@/ui/modals/replacement-preview-modal', () => ({ reviewReplacement: jest.fn(async () => true) }));

// Mock obsidian
jest.mock('obsidian', () => ({
	Notice: jest.fn().mockImplementation(() => ({ hide: jest.fn() })),
	Modal: class Modal {
		app: unknown;
		contentEl: unknown;
		constructor(app: unknown) { this.app = app; }
		open() {}
		close() {}
	},
	Component: class Component {
		load() {}
		unload() {}
	},
	MarkdownRenderer: { render: jest.fn().mockResolvedValue(undefined) },
}));

const explainTitles: string[] = [];
jest.mock('@/ui/modals/explain-text-modal', () => ({
	ExplainTextModal: class {
		constructor(_app: unknown, title: string) { explainTitles.push(title); }
		open() {}
		updateContent() {}
		setContent() {}
	},
}));

jest.mock('../../i18n', () => ({
	t: (key: string) => key,
}));

// ModelManager and ProviderFactory now ship from the same package, so they mock
// through one factory rather than one call per module.
jest.mock('@qwai/obsidian-llm', () => ({
	ModelManager: {
		findConfigForModelByProvider: jest.fn().mockReturnValue({
			provider: 'openai',
			apiKey: 'k',
			modelId: 'gpt-4o',
		}),
	},
	ProviderFactory: {
		createProvider: jest.fn().mockReturnValue({
			streamChat: jest.fn(async (_req: unknown, onChunk: (c: { done: boolean; content?: string }) => void) => {
				onChunk({ done: false, content: 'hello' });
				onChunk({ done: true });
			}),
		}),
	},
}));

function makeConfig(overrides = {}) {
	return {
		quickActions: [
			{ id: 'summarize', name: 'Summarize', prompt: 'Summarize: ', actionType: 'replace' as const, enabled: true },
		],
		quickActionPrefix: '⚡',
		llmConfigs: [{ id: 'p1', provider: 'openai', apiKey: 'k', modelId: 'gpt-4o' }] as any[],
		defaultModel: 'gpt-4o',
		...overrides,
	};
}

describe('EditorQuickActions', () => {
	describe('addMenuItems', () => {
		it('does not add items when selection is empty', () => {
			const app = {} as any;
			const qas = new EditorQuickActions(app, () => makeConfig());
			const menu = { addSeparator: jest.fn(), addItem: jest.fn() };
			const editor = { getSelection: jest.fn().mockReturnValue('') };
			(qas as any).addMenuItems(menu, editor, {});
			expect(menu.addSeparator).not.toHaveBeenCalled();
		});

		it('adds separator and one item when text is selected and action is enabled', () => {
			const app = {} as any;
			const qas = new EditorQuickActions(app, () => makeConfig());
			const menu = { addSeparator: jest.fn(), addItem: jest.fn() };
			const editor = { getSelection: jest.fn().mockReturnValue('some text') };
			(qas as any).addMenuItems(menu, editor, {});
			expect(menu.addSeparator).toHaveBeenCalledTimes(1);
			expect(menu.addItem).toHaveBeenCalledTimes(1);
		});

		it('adds no items when all actions are disabled', () => {
			const app = {} as any;
			const config = makeConfig({
				quickActions: [{ id: 'summarize', name: 'Summarize', prompt: 'Summarize: ', actionType: 'replace', enabled: false }],
			});
			const qas = new EditorQuickActions(app, () => config);
			const menu = { addSeparator: jest.fn(), addItem: jest.fn() };
			const editor = { getSelection: jest.fn().mockReturnValue('some text') };
			(qas as any).addMenuItems(menu, editor, {});
			expect(menu.addSeparator).not.toHaveBeenCalled();
		});
	});

	async function runFromMenu(action: Record<string, unknown>, editor: Record<string, unknown>): Promise<void> {
		const qas = new EditorQuickActions({} as any, () => makeConfig({ quickActions: [{ enabled: true, ...action }] }));
		let click: () => Promise<void> = async () => undefined;
		const item = { setTitle: () => item, setIcon: () => item, onClick: (handler: () => Promise<void>) => { click = handler; return item; } };
		(qas as any).addMenuItems({ addSeparator: jest.fn(), addItem: (build: (i: typeof item) => void) => build(item) }, { getSelection: () => 'selected', getValue: () => 'selected', getCursor: (side: string) => ({ line: 0, ch: side === 'to' ? 8 : 0 }), getRange: () => 'selected', ...editor }, {});
		await click();
	}

	describe('executeAction — replace', () => {
		it('reviews the replacement before applying it to the captured range', async () => {
			const editor = { replaceRange: jest.fn() };
			await runFromMenu({ id: 'summarize', name: 'Summarize', prompt: 'Summarize: ', actionType: 'replace' }, editor);
			expect(reviewReplacement).toHaveBeenCalledWith(expect.anything(), 'Summarize', 'selected', 'hello');
			expect(editor.replaceRange).toHaveBeenCalledWith('hello', { line: 0, ch: 0 }, { line: 0, ch: 8 });
		});
	});

	describe('executeAction — explain', () => {
		it('titles the result dialog with the quick action name', async () => {
			explainTitles.length = 0;
			await runFromMenu({ id: 'explain', name: 'Explain text', prompt: 'Explain: ', actionType: 'explain' }, { replaceSelection: jest.fn() });
			expect(explainTitles).toEqual(['Explain text']);
		});
	});
});
