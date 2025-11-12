import { App } from 'obsidian';
import type { LLMConfig, ModelInfo } from '@/types';
import { CACHE_DATA_FOLDER, LLM_MODEL_CACHE_PATH } from '@/constants';
import { ensureFolderExists } from '@/utils/file-system';

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
	private initialized = false;

	constructor(private readonly app: App) {}

	async initialize(): Promise<void> {
		if (this.initialized) return;
		await ensureFolderExists(this.app.vault.adapter, CACHE_DATA_FOLDER);
		if (!(await this.app.vault.adapter.exists(LLM_MODEL_CACHE_PATH))) {
			await this.writeCache({ version: CACHE_VERSION, updatedAt: Date.now(), entries: [] });
		}
		this.initialized = true;
	}

	async applyCacheToConfigs(configs: LLMConfig[]): Promise<void> {
		await this.initialize();
		const cache = await this.readCache();
		const map = new Map(cache.entries.map(entry => [entry.key, entry]));

		for (const config of configs) {
			const entry = map.get(this.buildKey(config));
			if (entry) {
				config.cachedModels = entry.cachedModels ?? [];
				config.cacheTimestamp = entry.cacheTimestamp ?? cache.updatedAt;
			}
		}
	}

	async saveFromConfigs(configs: LLMConfig[]): Promise<void> {
		await this.initialize();
		const entries: ModelCacheEntry[] = configs
			.filter(config => Array.isArray(config.cachedModels) && config.cachedModels.length > 0)
			.map(config => ({
				key: this.buildKey(config),
				provider: config.provider,
				baseUrl: config.baseUrl,
				cachedModels: config.cachedModels ?? [],
				cacheTimestamp: config.cacheTimestamp ?? Date.now()
			}));

		await this.writeCache({
			version: CACHE_VERSION,
			updatedAt: Date.now(),
			entries
		});
	}

	private buildKey(config: Pick<LLMConfig, 'provider' | 'baseUrl'>): string {
		const base = config.baseUrl?.trim().toLowerCase() || 'default';
		return `${config.provider}:${base}`;
	}

	private async readCache(): Promise<ModelCacheFile> {
		try {
			const content = await this.app.vault.adapter.read(LLM_MODEL_CACHE_PATH);
			return JSON.parse(content) as ModelCacheFile;
		} catch {
			return { version: CACHE_VERSION, updatedAt: Date.now(), entries: [] };
		}
	}

	private async writeCache(cache: ModelCacheFile): Promise<void> {
		await this.app.vault.adapter.write(LLM_MODEL_CACHE_PATH, JSON.stringify(cache, null, 2));
	}
}
