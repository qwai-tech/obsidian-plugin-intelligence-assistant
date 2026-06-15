import { App } from 'obsidian';
import { ModelSwitcherModal, openModelSwitcher } from '@/presentation/modals/model-switcher-modal';
import type { ModelInfo } from '@/types';

function model(id: string, name: string, provider: string): ModelInfo {
	return { id, name, provider, capabilities: ['chat'], enabled: true };
}

const MODELS: ModelInfo[] = [
	model('openai:gpt-4o', 'GPT-4o', 'openai'),
	model('anthropic:claude-3-5-sonnet', 'Claude 3.5 Sonnet', 'anthropic'),
];

describe('ModelSwitcherModal', () => {
	it('getItems returns the loaded model list', async () => {
		const modal = new ModelSwitcherModal(new App() as never, {
			getModels: () => MODELS,
			getCurrentModelId: () => 'openai:gpt-4o',
			applyModel: async () => {},
		});
		await modal.load();
		expect(modal.getItems()).toEqual(MODELS);
	});

	it('getItemText shows name, provider, and marks the active model', async () => {
		const modal = new ModelSwitcherModal(new App() as never, {
			getModels: () => MODELS,
			getCurrentModelId: () => 'openai:gpt-4o',
			applyModel: async () => {},
		});
		await modal.load();
		expect(modal.getItemText(MODELS[0])).toBe('GPT-4o — openai ✓');
		expect(modal.getItemText(MODELS[1])).toBe('Claude 3.5 Sonnet — anthropic');
	});

	it('onChooseItem applies the chosen model id', async () => {
		const applied: string[] = [];
		const modal = new ModelSwitcherModal(new App() as never, {
			getModels: () => MODELS,
			getCurrentModelId: () => 'openai:gpt-4o',
			applyModel: async (id) => { applied.push(id); },
		});
		await modal.load();
		modal.onChooseItem(MODELS[1], new MouseEvent('click'));
		// onChooseItem fires the apply asynchronously; flush microtasks.
		await new Promise((r) => setTimeout(r, 0));
		expect(applied).toEqual(['anthropic:claude-3-5-sonnet']);
	});

	it('getSuggestions fuzzy-filters items by query (via the base modal)', async () => {
		const modal = new ModelSwitcherModal(new App() as never, {
			getModels: () => MODELS,
			getCurrentModelId: () => '',
			applyModel: async () => {},
		});
		await modal.load();
		const results = modal.getSuggestions('claude');
		expect(results.map((r) => r.item.id)).toEqual(['anthropic:claude-3-5-sonnet']);
	});

	it('openModelSwitcher pre-loads items and opens the modal', async () => {
		const modal = await openModelSwitcher(new App() as never, {
			getModels: () => Promise.resolve(MODELS),
			getCurrentModelId: () => '',
			applyModel: async () => {},
		});
		expect(modal.getItems()).toEqual(MODELS);
		expect((modal as unknown as { isOpen: boolean }).isOpen).toBe(true);
	});
});
