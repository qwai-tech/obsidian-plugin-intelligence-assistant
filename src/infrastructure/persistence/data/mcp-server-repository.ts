import { App } from 'obsidian';
import type { MCPServerConfig } from '@/types';
import { DATA_FOLDER, MCP_SERVERS_PATH } from '@/constants';
import { ensureFolderExists } from '@/utils/file-system';

interface McpServerFile {
	version: string;
	updatedAt: number;
	servers: MCPServerConfig[];
}

const FILE_VERSION = '1.0';

export class McpServerRepository {
	private initialized = false;

	constructor(private readonly _app: App, private readonly filePath = MCP_SERVERS_PATH) {}

	async initialize(): Promise<void> {
		if (this.initialized) return;
		await ensureFolderExists(this._app.vault.adapter, DATA_FOLDER);
		if (!(await this._app.vault.adapter.exists(this.filePath))) {
			await this._app.vault.adapter.write(
				this.filePath,
				JSON.stringify({ version: FILE_VERSION, updatedAt: Date.now(), servers: [] }, null, 2)
			);
		}
		this.initialized = true;
	}

	async loadAll(): Promise<MCPServerConfig[]> {
		await this.initialize();
		try {
			const content = await this._app.vault.adapter.read(this.filePath);
			const parsed = JSON.parse(content) as McpServerFile;
			return Array.isArray(parsed.servers) ? parsed.servers : [];
		} catch (error) {
			console.warn('[MCP] Failed to load MCP servers:', error);
			return [];
		}
	}

	async saveAll(servers: MCPServerConfig[]): Promise<void> {
		await this.initialize();
		const payload: McpServerFile = {
			version: FILE_VERSION,
			updatedAt: Date.now(),
			servers: servers ?? []
		};
		await this._app.vault.adapter.write(this.filePath, JSON.stringify(payload, null, 2));
	}
}
