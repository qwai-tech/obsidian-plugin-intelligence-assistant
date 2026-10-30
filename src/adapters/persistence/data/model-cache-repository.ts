import type { App } from 'obsidian';
import type { LLMConfig, ModelInfo } from '@/features/llm';
import { JsonFile } from '@/adapters/persistence/json-file';

interface ModelCacheEntry {
	key: string;
	provider: string;
	baseUrl?: string;
	cachedModels: ModelInfo[];
	cacheTimestamp?: number;
}

interface ModelCacheFile {
	version: string;
	updatedAt: number;
	entries: ModelCacheEntry[];
}

const CACHE_VERSION = '1.0';

export class ModelCacheRepository {
	private readonly file: JsonFile<ModelCacheFile>;

	constructor(app: App, filePath: string) {
		this.file = new JsonFile(app.vault.adapter, filePath, () => ({ version: CACHE_VERSION, updatedAt: 0, entries: [] }));
	}

	async applyCacheToConfigs(configs: LLMConfig[]): Promise<void> {
		const cache = await this.file.read();
		const map = new Map((cache.entries ?? []).map(entry => [entry.key, entry]));

		for (const config of configs) {
			const entry = map.get(this.buildKey(config));
			if (entry) {
				config.cachedModels = entry.cachedModels ?? [];
				config.cacheTimestamp = entry.cacheTimestamp ?? cache.updatedAt;
			}
		}
	}

	async saveFromConfigs(configs: LLMConfig[]): Promise<void> {
		const entries: ModelCacheEntry[] = configs
			.filter(config => Array.isArray(config.cachedModels) && config.cachedModels.length > 0)
			.map(config => ({
				key: this.buildKey(config),
				provider: config.provider,
				baseUrl: config.baseUrl,
				cachedModels: config.cachedModels ?? [],
				cacheTimestamp: config.cacheTimestamp ?? Date.now()
			}));
		await this.file.write({ version: CACHE_VERSION, updatedAt: Date.now(), entries });
	}

	private buildKey(config: Pick<LLMConfig, 'provider' | 'baseUrl'>): string {
		const base = config.baseUrl?.trim().toLowerCase() || 'default';
		return `${config.provider}:${base}`;
	}
}
