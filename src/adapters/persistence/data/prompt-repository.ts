import type { App } from 'obsidian';
import type { SystemPrompt } from '@/features/agent/types/agent';
import { pluginPaths } from '@/core/plugin-paths';
import { JsonCollection } from '@/adapters/persistence/json-collection';

interface PromptIndexEntry {
	id: string;
	name: string;
	enabled: boolean;
	updatedAt: number;
	file: string;
}

export class PromptRepository {
	private readonly collection: JsonCollection<SystemPrompt, PromptIndexEntry>;

	constructor(app: App) {
		this.collection = new JsonCollection(app.vault.adapter, pluginPaths(app.vault.configDir).prompts, {
			entriesKey: 'prompts',
			filePrefix: 'prompt',
			toEntry: (prompt, file) => ({ id: prompt.id, name: prompt.name, enabled: prompt.enabled !== false, updatedAt: prompt.updatedAt ?? Date.now(), file }),
		});
	}

	async loadAll(): Promise<{ prompts: SystemPrompt[]; activeId: string | null }> {
		const { items, activeId } = await this.collection.load();
		if (items.length > 0) {
			return { prompts: items, activeId };
		}
		const discovered = await this.collection.scan();
		if (discovered.length > 0) {
			await this.collection.save(discovered, activeId);
		}
		return { prompts: discovered, activeId };
	}

	async saveAll(prompts: SystemPrompt[], activeId: string | null): Promise<void> {
		await this.collection.save(prompts, activeId ?? null);
	}
}
