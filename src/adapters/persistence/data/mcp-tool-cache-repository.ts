import { App } from 'obsidian';
import type { CachedMCPTool } from '@/features/tools';
import { buildSafeName } from '@/core/utils/file-system';
import { pluginPaths } from '@/core/plugin-paths';
import { JsonFile } from '@/adapters/persistence/json-file';

interface ToolCacheFile {
	version: string;
	server: string;
	updatedAt: number;
	tools: CachedMCPTool[];
}

const CACHE_VERSION = '1.0';

export class McpToolCacheRepository {
	private readonly files = new Map<string, JsonFile<ToolCacheFile | null>>();

	constructor(private readonly _app: App, private readonly baseFolder = pluginPaths(_app.vault.configDir).mcpToolsCache) {}

	async save(serverName: string, tools: CachedMCPTool[], updatedAt?: number): Promise<void> {
		await this.fileFor(serverName).write({
			version: CACHE_VERSION,
			server: serverName,
			updatedAt: updatedAt ?? Date.now(),
			tools: tools ?? []
		});
	}

	async load(serverName: string): Promise<ToolCacheFile | null> {
		return await this.fileFor(serverName).read();
	}

	async loadAll(): Promise<Record<string, ToolCacheFile>> {
		if (!(await this._app.vault.adapter.exists(this.baseFolder))) {
			return {};
		}
		const result: Record<string, ToolCacheFile> = {};
		try {
			const listing = await this._app.vault.adapter.list(this.baseFolder);
			for (const file of listing.files) {
				if (!file.endsWith('.json')) continue;
				try {
					const content = await this._app.vault.adapter.read(file);
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

	private fileFor(serverName: string): JsonFile<ToolCacheFile | null> {
		let file = this.files.get(serverName);
		if (!file) {
			file = new JsonFile<ToolCacheFile | null>(this._app.vault.adapter, `${this.baseFolder}/${buildSafeName(serverName, 'mcp')}.json`, () => null);
			this.files.set(serverName, file);
		}
		return file;
	}
}
