import { App } from 'obsidian';
import type { LLMConfig } from '@/types';
import { DATA_FOLDER, LLM_PROVIDERS_PATH } from '@/constants';
import { ensureFolderExists } from '@/utils/file-system';

export class ProviderRepository {
	private initialized = false;

	constructor(private readonly _app: App, private readonly filePath = LLM_PROVIDERS_PATH) {}

	async initialize(): Promise<void> {
		if (this.initialized) return;
		await ensureFolderExists(this._app.vault.adapter, DATA_FOLDER);
		if (!(await this._app.vault.adapter.exists(this.filePath))) {
			await this._app.vault.adapter.write(this.filePath, JSON.stringify({ version: 1, providers: [] }, null, 2));
		}
		this.initialized = true;
	}

	async loadAll(): Promise<LLMConfig[]> {
		await this.initialize();
		try {
			const content = await this._app.vault.adapter.read(this.filePath);
			const parsed = JSON.parse(content) as { providers?: LLMConfig[] };
			return Array.isArray(parsed.providers) ? parsed.providers : [];
		} catch (error) {
			console.warn('[Providers] Failed to load provider list:', error);
			return [];
		}
	}

	async saveAll(configs: LLMConfig[]): Promise<void> {
		await this.initialize();
		const payload = {
			version: 1,
			updatedAt: Date.now(),
			providers: configs ?? []
		};
		await this._app.vault.adapter.write(this.filePath, JSON.stringify(payload, null, 2));
	}
}
