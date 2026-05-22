/**
 * BuiltinToolSource - the tool source for the plugin's built-in vault tools.
 * Always the single 'builtin' source; load() synchronously constructs the
 * six builtin tool instances; dispose() is a no-op.
 */
import type { App } from 'obsidian';
import type { ToolSource } from '../tool-source';
import type { SourceTool, ToolSourceKind } from '@/types/common/tools';
import {
	ListFilesTool,
	ReadFileTool,
	WriteFileTool,
} from '@/application/services/file-tools';
import {
	AppendToNoteTool,
	CreateNoteTool,
	SearchFilesTool,
} from '@/application/services/search-tools';

export class BuiltinToolSource implements ToolSource {
	readonly kind: ToolSourceKind = 'builtin';
	readonly id: string = 'builtin';
	readonly label: string = 'Built-in Tools';

	constructor(private readonly app: App) {}

	/** Construct fresh instances of the six builtin tools. */
	load(): Promise<SourceTool[]> {
		const tools: SourceTool[] = [
			new ReadFileTool(this.app),
			new WriteFileTool(this.app),
			new ListFilesTool(this.app),
			new SearchFilesTool(this.app),
			new CreateNoteTool(this.app),
			new AppendToNoteTool(this.app),
		];
		return Promise.resolve(tools);
	}

	/** Builtin tools hold no external resources. */
	dispose(): Promise<void> {
		return Promise.resolve();
	}
}
