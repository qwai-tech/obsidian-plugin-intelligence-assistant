import type { App } from 'obsidian';
import { getDefaultHttpPort } from '@qwai/obsidian-llm';
import type { ToolSourceFactory } from '@/features/tools';
import { BuiltinToolSource, McpToolSource, OpenApiToolSource, CliToolSource } from '@/features/tools';
import { ObsidianFileSystem } from '@/adapters/obsidian/obsidian-file-system';
import { connectMcpStdio } from '@/adapters/process/mcp-stdio-connector';
import { runCommand } from '@/adapters/process/command-runner';

export function createToolSourceFactory(app: App, pluginDataPath: string): ToolSourceFactory {
	const fileSystem = new ObsidianFileSystem(app);
	return {
		builtin: (enabledTypes) => new BuiltinToolSource(app, enabledTypes),
		mcp: (server) => new McpToolSource(server, connectMcpStdio),
		openApi: (config, options) => new OpenApiToolSource(config, { fileSystem, pluginDataPath, http: getDefaultHttpPort(), refetch: options?.refetch }),
		cli: (config) => new CliToolSource(config, runCommand),
	};
}
