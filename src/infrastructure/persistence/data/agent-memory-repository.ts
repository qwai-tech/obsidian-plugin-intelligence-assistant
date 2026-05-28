import { App } from 'obsidian';
import { AGENT_MEMORY_DATA_FOLDER, AGENT_MEMORY_PATH } from '@/constants';
import { ensureFolderExists } from '@/utils/file-system';
import type { AgentMemorySnapshot } from '@/application/agents';

export interface AgentMemoryFile {
	version: 1;
	updatedAt: number;
	agents: Record<string, AgentMemorySnapshot>;
}

export class AgentMemoryRepository {
	private initialized = false;

	constructor(private readonly app: App, private readonly filePath = AGENT_MEMORY_PATH) {}

	async initialize(): Promise<void> {
		if (this.initialized) return;
		await ensureFolderExists(this.app.vault.adapter, AGENT_MEMORY_DATA_FOLDER);
		if (!(await this.app.vault.adapter.exists(this.filePath))) {
			await this.writeFile({ version: 1, updatedAt: Date.now(), agents: {} });
		}
		this.initialized = true;
	}

	async load(): Promise<AgentMemoryFile> {
		await this.initialize();
		try {
			const raw = await this.app.vault.adapter.read(this.filePath);
			const parsed = JSON.parse(raw) as Partial<AgentMemoryFile>;
			return {
				version: 1,
				updatedAt: parsed.updatedAt ?? 0,
				agents: parsed.agents ?? {},
			};
		} catch {
			return { version: 1, updatedAt: 0, agents: {} };
		}
	}

	async save(file: AgentMemoryFile): Promise<void> {
		await this.initialize();
		await this.writeFile(file);
	}

	private async writeFile(file: AgentMemoryFile): Promise<void> {
		await this.app.vault.adapter.write(
			this.filePath,
			JSON.stringify({ ...file, updatedAt: Date.now() }, null, 2),
		);
	}
}
