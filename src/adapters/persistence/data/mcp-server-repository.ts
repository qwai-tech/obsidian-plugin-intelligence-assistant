import type { App } from 'obsidian';
import type { MCPServerConfig } from '@/features/tools';
import { JsonFile } from '@/adapters/persistence/json-file';

interface McpServerFile {
	version: string;
	updatedAt: number;
	servers: MCPServerConfig[];
}

const FILE_VERSION = '1.0';

export class McpServerRepository {
	private readonly file: JsonFile<McpServerFile>;

	constructor(app: App, filePath: string) {
		this.file = new JsonFile(app.vault.adapter, filePath, () => ({ version: FILE_VERSION, updatedAt: 0, servers: [] }));
	}

	async loadAll(): Promise<MCPServerConfig[]> {
		const { servers } = await this.file.read();
		return Array.isArray(servers) ? servers : [];
	}

	async saveAll(servers: MCPServerConfig[]): Promise<void> {
		await this.file.write({ version: FILE_VERSION, updatedAt: Date.now(), servers: servers ?? [] });
	}
}
