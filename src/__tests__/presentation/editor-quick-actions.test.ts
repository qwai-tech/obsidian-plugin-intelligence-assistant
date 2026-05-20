// src/__tests__/presentation/editor-quick-actions.test.ts
import { EditorQuickActions } from '../../presentation/editor/editor-quick-actions';

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

jest.mock('../../i18n', () => ({
	t: (key: string) => key,
}));

jest.mock('../../infrastructure/llm/model-manager', () => ({
	ModelManager: {
		findConfigForModelByProvider: jest.fn().mockReturnValue({
			provider: 'openai',
			apiKey: 'k',
			modelId: 'gpt-4o',
		}),
	},
}));

jest.mock('../../infrastructure/llm/provider-factory', () => ({
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

	describe('executeAction — replace', () => {
		it('calls editor.replaceSelection with streamed result', async () => {
			const app = {} as any;
			const qas = new EditorQuickActions(app, () => makeConfig());
			const editor = { replaceSelection: jest.fn(), getSelection: jest.fn() };
			await (qas as any).executeAction(editor, 'selected', 'Summarize: ', 'replace', undefined);
			expect(editor.replaceSelection).toHaveBeenCalledWith('hello');
		});
	});
});
