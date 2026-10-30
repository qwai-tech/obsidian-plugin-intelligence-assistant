import { applyDisabledModels, fromSettingsDocument, isSettingsDocument, toSettingsDocument } from '@/features/settings/settings-document';
import { DEFAULT_SETTINGS, userConfigToPluginSettings } from '@/features/settings/settings-codec';
import type { PluginSettings } from '@/features/settings/types/settings';

const settings = (): PluginSettings => {
	const value = structuredClone(DEFAULT_SETTINGS);
	value.defaultModel = 'openai:gpt-4o';
	value.llmConfigs = [{ provider: 'openai', apiKeySecret: 'k', cachedModels: [{ id: 'm', name: 'M', provider: 'openai', capabilities: [] }], cacheTimestamp: 5 }];
	value.systemPrompts = [{ id: 'p1', name: 'P', content: 'c', enabled: true, createdAt: 1, updatedAt: 1 }];
	value.activeSystemPromptId = 'p1';
	value.agents = [{ id: 'a1', name: 'A' } as PluginSettings['agents'][number]];
	value.activeAgentId = 'a1';
	value.mcpServers = [{ name: 's', command: 'run', enabled: true, cachedTools: [], cacheTimestamp: 9 } as PluginSettings['mcpServers'][number]];
	return value;
};

describe('settings document', () => {
	it('round-trips every settings unit', () => {
		const original = settings();

		const { userConfig, stored } = fromSettingsDocument(JSON.parse(JSON.stringify(toSettingsDocument(original))));
		const restored = { ...userConfigToPluginSettings(userConfig), ...stored };

		expect(restored.defaultModel).toBe('openai:gpt-4o');
		expect(restored.llmConfigs).toEqual([{ provider: 'openai', apiKeySecret: 'k' }]);
		expect(restored.systemPrompts).toEqual(original.systemPrompts);
		expect(restored.activeSystemPromptId).toBe('p1');
		expect(restored.agents).toEqual(original.agents);
		expect(restored.activeAgentId).toBe('a1');
		expect(restored.mcpServers).toEqual([{ name: 's', command: 'run', enabled: true }]);
	});

	it('leaves model and tool caches out of the document', () => {
		const json = JSON.stringify(toSettingsDocument(settings()));

		expect(json).not.toContain('cachedModels');
		expect(json).not.toContain('cachedTools');
		expect(json).not.toContain('cacheTimestamp');
	});

	it('recognises only the current document format', () => {
		expect(isSettingsDocument(toSettingsDocument(settings()))).toBe(true);
		expect(isSettingsDocument({ defaultModel: 'legacy data.json' })).toBe(false);
		expect(isSettingsDocument(null)).toBe(false);
	});

	it('records the models switched off on each provider, keeping ones this device has not cached', () => {
		const value = settings();
		value.llmConfigs = [{
			provider: 'openai',
			disabledModels: ['from-other-device', 'm-on'],
			cachedModels: [
				{ id: 'm-on', name: 'On', provider: 'openai', capabilities: [], enabled: true },
				{ id: 'm-off', name: 'Off', provider: 'openai', capabilities: [], enabled: false },
			],
		}];

		expect(toSettingsDocument(value).providers[0].disabledModels).toEqual(['from-other-device', 'm-off']);
	});

	it('switches off the recorded models once the cache is loaded', () => {
		const configs = [{
			provider: 'openai',
			disabledModels: ['m-off'],
			cachedModels: [
				{ id: 'm-on', name: 'On', provider: 'openai', capabilities: [] },
				{ id: 'm-off', name: 'Off', provider: 'openai', capabilities: [] },
			],
		}];

		applyDisabledModels(configs);

		expect(configs[0].cachedModels.map(model => (model as { enabled?: boolean }).enabled !== false)).toEqual([true, false]);
	});
});

