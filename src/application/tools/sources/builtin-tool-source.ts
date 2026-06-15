/**
 * BuiltinToolSource - the tool source for the plugin's built-in vault tools.
 * Always the single 'builtin' source; load() reads the current set of
 * globally-enabled builtin tool types and constructs an instance for each
 * one. dispose() is a no-op.
 */
import type { App } from 'obsidian';
import type { ToolSource } from '../tool-source';
import type { SourceTool, ToolSourceKind } from '@/types/common/tools';
import {
	ListFilesTool,
	ReadFileTool,
	WriteFileTool,
	UpdatePropertiesTool,
} from '@/application/services/file-tools';
import {
	AppendToNoteTool,
	CreateNoteTool,
	SearchFilesTool,
} from '@/application/services/search-tools';
import {
	ReadCanvasTool,
	UpdateCanvasTool,
} from '@/application/services/canvas-tools';
import { ReadPdfTool } from '@/application/services/pdf-tools';
import {
	FindNotesByTagTool,
	ResolveLinkTool,
} from '@/application/services/tag-tools';
import { MakeLinkTool } from '@/application/services/link-tools';

/**
 * Factory for one of the six builtin tools, keyed by its definition.name.
 * Adding a new builtin tool here is the only place that needs to learn it.
 */
type BuiltinToolFactory = (app: App) => SourceTool;
const BUILTIN_TOOL_FACTORIES: Record<string, BuiltinToolFactory> = {
	read_file: (app) => new ReadFileTool(app),
	write_file: (app) => new WriteFileTool(app),
	list_files: (app) => new ListFilesTool(app),
	search_files: (app) => new SearchFilesTool(app),
	create_note: (app) => new CreateNoteTool(app),
	append_to_note: (app) => new AppendToNoteTool(app),
	update_properties: (app) => new UpdatePropertiesTool(app),
	read_canvas: (app) => new ReadCanvasTool(app),
	update_canvas: (app) => new UpdateCanvasTool(app),
	read_pdf: (app) => new ReadPdfTool(app),
	find_notes_by_tag: (app) => new FindNotesByTagTool(app),
	resolve_link: (app) => new ResolveLinkTool(app),
	make_link: (app) => new MakeLinkTool(app),
};

/** All builtin tool types in their canonical registration order. */
export const ALL_BUILTIN_TOOL_TYPES: readonly string[] = Object.keys(BUILTIN_TOOL_FACTORIES);

export class BuiltinToolSource implements ToolSource {
	readonly kind: ToolSourceKind = 'builtin';
	readonly id: string = 'builtin';
	readonly label: string = 'Built-in Tools';

	/**
	 * @param app Obsidian app for tool wiring.
	 * @param getEnabledTypes Callback returning the set of globally-enabled
	 *   builtin tool types. Read on every load() so toggling a tool in
	 *   settings and calling reloadSource takes effect without rebuilding
	 *   the source. Pass `() => null` (or omit) to load all builtin tools.
	 */
	constructor(
		private readonly app: App,
		private readonly getEnabledTypes: () => Iterable<string> | null = () => null,
	) {}

	/** Construct instances of the builtin tools whose type is currently enabled. */
	load(): Promise<SourceTool[]> {
		const enabledIterable = this.getEnabledTypes();
		const enabledFilter: Set<string> | null = enabledIterable
			? new Set(enabledIterable)
			: null;

		const tools: SourceTool[] = [];
		for (const [type, factory] of Object.entries(BUILTIN_TOOL_FACTORIES)) {
			if (enabledFilter && !enabledFilter.has(type)) continue;
			tools.push(factory(this.app));
		}
		return Promise.resolve(tools);
	}

	/** Builtin tools hold no external resources. */
	dispose(): Promise<void> {
		return Promise.resolve();
	}
}
