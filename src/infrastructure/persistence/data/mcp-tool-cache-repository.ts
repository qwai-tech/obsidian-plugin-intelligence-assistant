import { App } from 'obsidian';
import type { CachedMCPTool } from '@/types';
import { MCP_TOOLS_CACHE_FOLDER } from '@/constants';
import { ensureFolderExists, buildSafeName } from '@/utils/file-system';

interface ToolCacheFile {
	version: string;
	server: string;
	updatedAt: number;
	tools: CachedMCPTool[];
}

const CACHE_VERSION = '1.0';

export class McpToolCacheRepository {
	private initialized = false;

	constructor(private readonly app: App, private readonly baseFolder = MCP_TOOLS_CACHE_FOLDER) {}

	async initialize(): Promise<void> {
		if (this.initialized) return;
		await ensureFolderExists(this.app.vault.adapter, this.baseFolder);
		this.initialized = true;
	}

	async save(serverName: string, tools: CachedMCPTool[], updatedAt?: number): Promise<void> {
		await this.initialize();
		const filePath = this.getCacheFilePath(serverName);
		const payload: ToolCacheFile = {
			version: CACHE_VERSION,
			server: serverName,
			updatedAt: updatedAt ?? Date.now(),
			tools: tools ?? []
		};
		await this.app.vault.adapter.write(filePath, JSON.stringify(payload, null, 2));
	}

	async load(serverName: string): Promise<ToolCacheFile | null> {
		await this.initialize();
		const filePath = this.getCacheFilePath(serverName);
		if (!(await this.app.vault.adapter.exists(filePath))) {
			return null;
		}
		try {
			const content = await this.app.vault.adapter.read(filePath);
			return JSON.parse(content) as ToolCacheFile;
		} catch (error) {
			console.warn(`[MCP] Failed to load cache for ${serverName}:`, error);
			return null;
		}
	}

	async loadAll(): Promise<Record<string, ToolCacheFile>> {
		await this.initialize();
		const result: Record<string, ToolCacheFile> = {};
		try {
			const listing = await this.app.vault.adapter.list(this.baseFolder);
			for (const file of listing.files) {
				if (!file.endsWith('.json')) continue;
				try {
					const content = await this.app.vault.adapter.read(file);
					const parsed = JSON.parse(content) as ToolCacheFile;
					if (parsed?.server) {
						result[parsed.server] = parsed;
					}
				} catch (error) {
					console.warn(`[MCP] Failed to parse cache file ${file}:`, error);
				}
			}
		} catch (error) {
			console.warn('[MCP] Failed to enumerate tool cache folder:', error);
		}
		return result;
	}

	private getCacheFilePath(serverName: string): string {
		const safe = buildSafeName(serverName, 'mcp');
		return `${this.baseFolder}/${safe}.json`;
	}
}
