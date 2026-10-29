import type { App } from 'obsidian';
import { getDefaultHttpPort } from '@qwai/obsidian-llm';
import type { ToolSourceFactory } from '@/application/tools/tool-source-manager';
import { BuiltinToolSource } from '@/application/tools/sources/builtin-tool-source';
import { McpToolSource } from '@/application/tools/sources/mcp-tool-source';
import { OpenApiToolSource } from '@/application/tools/sources/openapi-tool-source';
import { CliToolSource } from '@/application/tools/sources/cli-tool-source';
import { ObsidianFileSystem } from '@/infrastructure/obsidian/obsidian-file-system';

export function createToolSourceFactory(app: App, pluginDataPath: string): ToolSourceFactory {
	const fileSystem = new ObsidianFileSystem(app);
	return {
		builtin: (enabledTypes) => new BuiltinToolSource(app, enabledTypes),
		mcp: (server) => new McpToolSource(server),
		openApi: (config, options) => new OpenApiToolSource(config, { fileSystem, pluginDataPath, http: getDefaultHttpPort(), refetch: options?.refetch }),
		cli: (config) => new CliToolSource(config),
	};
}
