import { initialModelSelection, modelCatalog, uniquePromptId } from '../agent-model-options';

const configs = [
	{ provider: 'openai', cachedModels: [{ id: 'openai:gpt-4o', name: 'GPT-4o', provider: 'openai', capabilities: [], enabled: true }] },
	{ provider: 'open-router', cachedModels: [
		{ id: 'openai:gpt-4o', name: 'Duplicate', provider: 'openai', capabilities: [], enabled: true },
		{ id: 'claude-3', name: 'Claude 3', provider: 'open-router', capabilities: [], enabled: true },
	] },
] as never;

describe('modelCatalog', () => {
	it('lists each model once with its provider label, sorted by label', () => {
		expect(modelCatalog(configs).options).toEqual([
			{ id: 'claude-3', label: 'Claude 3 • Open Router' },
			{ id: 'openai:gpt-4o', label: 'GPT-4o • OpenAI' },
		]);
	});

	it('maps provider-less ids to their prefixed form', () => {
		expect(modelCatalog(configs).aliases.get('gpt-4o')).toBe('openai:gpt-4o');
	});
});

describe('initialModelSelection', () => {
	const catalog = modelCatalog(configs);

	it('keeps a fixed model that exists, directly or through its alias', () => {
		expect(initialModelSelection(catalog, { strategy: 'fixed', modelId: 'claude-3' })).toBe('claude-3');
		expect(initialModelSelection(catalog, { strategy: 'fixed', modelId: 'gpt-4o' })).toBe('openai:gpt-4o');
	});

	it('falls back to the first option, or the stored id when there are no options', () => {
		expect(initialModelSelection(catalog, { strategy: 'default' })).toBe('claude-3');
		expect(initialModelSelection({ options: [], aliases: new Map() }, { strategy: 'fixed', modelId: 'x' })).toBe('x');
	});
});

describe('uniquePromptId', () => {
	it('slugifies the name and avoids existing ids', () => {
		expect(uniquePromptId('My Agent!', [])).toBe('agent-my-agent');
		expect(uniquePromptId('My Agent', ['agent-my-agent', 'agent-my-agent-1'])).toBe('agent-my-agent-2');
		expect(uniquePromptId('', [])).toBe('agent-agent-prompt');
	});
});
