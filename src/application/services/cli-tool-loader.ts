/**
 * CLI Tool Loader
 * Manages loading and unloading of CLI tools
 */

import type { CLIToolConfig } from '@/types/features/cli-tools';
import { CLITool } from './cli-tool';
import type { ToolManager } from './tool-manager';

export class CLIToolLoader {
	private loadedToolIds: Set<string> = new Set();

	constructor(private toolManager: ToolManager) {}

	/**
	 * Load all CLI tools from configuration
	 */
	loadAll(configs: CLIToolConfig[]): void {
		// First, unload any previously loaded CLI tools
		this.unloadAll();

		// Then load enabled CLI tools
		for (const config of configs) {
			if (config.enabled) {
				this.loadTool(config);
			}
		}

		console.debug(`[CLI Tools] Loaded ${this.loadedToolIds.size} CLI tools`);
	}

	/**
	 * Load a single CLI tool
	 */
	loadTool(config: CLIToolConfig): void {
		if (!config.enabled) {
			console.debug(`[CLI Tools] Skipping disabled tool: ${config.name}`);
			return;
		}

		try {
			const tool = new CLITool(config);
			this.toolManager.registerTool(tool);
			this.toolManager.enableTool(tool.definition.name);
			this.loadedToolIds.add(config.id);

			console.debug(`[CLI Tools] Loaded tool: ${config.name} (${config.id})`);
		} catch (error) {
			console.error(`[CLI Tools] Failed to load tool ${config.name}:`, error);
		}
	}

	/**
	 * Unload a single CLI tool by ID
	 */
	unloadTool(toolId: string): void {
		const providerId = `cli:${toolId}`;
		const removed = this.toolManager.removeToolsByProvider(providerId);

		if (removed > 0) {
			this.loadedToolIds.delete(toolId);
			console.debug(`[CLI Tools] Unloaded tool: ${toolId}`);
		}
	}

	/**
	 * Unload all CLI tools
	 */
	unloadAll(): void {
		for (const toolId of this.loadedToolIds) {
			const providerId = `cli:${toolId}`;
			this.toolManager.removeToolsByProvider(providerId);
		}
		this.loadedToolIds.clear();
		console.debug('[CLI Tools] Unloaded all CLI tools');
	}

	/**
	 * Reload CLI tools with new configuration
	 */
	reload(configs: CLIToolConfig[]): void {
		this.loadAll(configs);
	}

	/**
	 * Get list of loaded CLI tool IDs
	 */
	getLoadedToolIds(): string[] {
		return Array.from(this.loadedToolIds);
	}

	/**
	 * Check if a CLI tool is loaded
	 */
	isToolLoaded(toolId: string): boolean {
		return this.loadedToolIds.has(toolId);
	}
}
