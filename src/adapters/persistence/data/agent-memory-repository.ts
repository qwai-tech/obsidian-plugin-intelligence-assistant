import type { App } from 'obsidian';
import type { AgentMemoryFile } from '@/features/agent';
import { JsonFile } from '@/adapters/persistence/json-file';

export class AgentMemoryRepository {
	private readonly file: JsonFile<Partial<AgentMemoryFile>>;

	constructor(app: App, filePath: string) {
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
