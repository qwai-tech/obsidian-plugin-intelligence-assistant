import type { App } from 'obsidian';
import type { LLMConfig } from '@/features/llm';
import { pluginPaths } from '@/core/plugin-paths';
import { JsonFile } from '@/adapters/persistence/json-file';

interface ProviderFile {
	version: number;
	updatedAt?: number;
	providers: LLMConfig[];
}

export class ProviderRepository {
	private readonly file: JsonFile<ProviderFile>;

	constructor(app: App, filePath = pluginPaths(app.vault.configDir).providers) {
		this.file = new JsonFile(app.vault.adapter, filePath, () => ({ version: 1, providers: [] }));
	}

	async loadAll(): Promise<LLMConfig[]> {
		const { providers } = await this.file.read();
		return Array.isArray(providers) ? providers : [];
	}

	async saveAll(configs: LLMConfig[]): Promise<void> {
		await this.file.write({ version: 1, updatedAt: Date.now(), providers: configs ?? [] });
	}
}
