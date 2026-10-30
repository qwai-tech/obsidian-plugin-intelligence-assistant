import { pluginSettingsToUserConfig, userConfigToPluginSettings } from '@/features/settings/settings-codec';
import type { UserConfig } from '@/features/settings/types/settings';

describe('settings codec', () => {
	it('fills RAG fields a partial config leaves out from the defaults', () => {
		const defaults = userConfigToPluginSettings(null).ragConfig;
		const config = pluginSettingsToUserConfig(userConfigToPluginSettings(null));
		const partial = { ...config, rag: { enabled: false, embedding: { model: 'text-embedding-3-small' } } } as unknown as UserConfig;

		const rag = userConfigToPluginSettings(partial).ragConfig;

		expect(rag.enabled).toBe(false);
		expect(rag.embeddingModel).toBe('text-embedding-3-small');
		expect(rag.vectorStore).toBe(defaults.vectorStore);
		expect(rag.embedChangedFiles).toBe(defaults.embedChangedFiles);
		expect(rag.chunkSize).toBe(defaults.chunkSize);
		expect(rag.minRelevanceScore).toBe(defaults.minRelevanceScore);
		expect(Object.values(rag).every(value => value !== undefined)).toBe(true);
	});
});
