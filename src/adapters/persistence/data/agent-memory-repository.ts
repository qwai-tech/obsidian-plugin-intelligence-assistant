import type { App } from 'obsidian';
import type { AgentMemoryFile } from '@/features/agent/types/memory';
import { pluginPaths } from '@/core/plugin-paths';
import { JsonFile } from '@/adapters/persistence/json-file';

export class AgentMemoryRepository {
	private readonly file: JsonFile<Partial<AgentMemoryFile>>;

	constructor(app: App, filePath = pluginPaths(app.vault.configDir).agentMemory) {
		this.file = new JsonFile(app.vault.adapter, filePath, () => ({}));
	}

	async load(): Promise<AgentMemoryFile> {
		const stored = await this.file.read();
		return { version: 1, updatedAt: stored.updatedAt ?? 0, agents: stored.agents ?? {} };
	}

	async save(memory: AgentMemoryFile): Promise<void> {
		await this.file.write({ ...memory, updatedAt: Date.now() });
	}
}
