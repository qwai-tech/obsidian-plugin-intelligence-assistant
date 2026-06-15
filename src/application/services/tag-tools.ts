import {
	App,
	TFile,
	getAllTags,
	parseLinktext,
	resolveSubpath,
} from 'obsidian';
import { Tool, ToolDefinition, ToolResult } from './types';
import { createToolDefinition } from '@/application/tools/tool-schema';
import { z } from 'zod';

/** Normalize a user-supplied tag to the `#tag` form `getAllTags` returns. */
function normalizeTag(tag: string): string {
	const trimmed = tag.trim();
	return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

/**
 * FindNotesByTagTool — find markdown notes carrying a given tag, using
 * Obsidian's `getAllTags(cache)` so both frontmatter `tags:` and inline
 * `#tags` are recognised (instead of a raw text scan).
 */
export class FindNotesByTagTool implements Tool {
	constructor(private _app: App) {}

	definition: ToolDefinition = createToolDefinition({
		name: 'find_notes_by_tag',
		description:
			'Find markdown notes that carry a given tag (matches both frontmatter tags and inline #tags).',
		parameters: [
			{
				name: 'tag',
				type: 'string',
				description: 'Tag to search for, with or without a leading "#" (e.g. "project" or "#project")',
				required: true,
			},
		],
		inputSchema: z.object({ tag: z.string().min(1) }),
	});

	execute(args: Record<string, unknown>): Promise<ToolResult> {
		try {
			const wanted = normalizeTag(args.tag as string);
			const matches: Array<{ path: string; tags: string[] }> = [];

			for (const file of this._app.vault.getMarkdownFiles()) {
				const cache = this._app.metadataCache.getFileCache(file);
				if (!cache) continue;
				const tags = getAllTags(cache) ?? [];
				if (tags.includes(wanted)) {
					matches.push({ path: file.path, tags });
				}
			}

			return Promise.resolve({ success: true, result: matches });
		} catch (error) {
			return Promise.resolve({
				success: false,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}

/**
 * ResolveLinkTool — resolve an Obsidian wikilink (e.g. `Note#Heading`) to a
 * concrete vault path and, when a subpath is present, the byte range of the
 * referenced heading/block. Uses `parseLinktext` + `resolveSubpath` so links
 * resolve exactly as Obsidian would.
 */
export class ResolveLinkTool implements Tool {
	constructor(private _app: App) {}

	definition: ToolDefinition = createToolDefinition({
		name: 'resolve_link',
		description:
			'Resolve an Obsidian wikilink (optionally with a #heading or #^block subpath) to a vault path and target location.',
		parameters: [
			{
				name: 'linktext',
				type: 'string',
				description: 'The link text to resolve, e.g. "My Note" or "My Note#Some Heading"',
				required: true,
			},
			{
				name: 'sourcePath',
				type: 'string',
				description: 'Path of the note the link appears in (used to resolve relative links)',
				required: false,
			},
		],
		inputSchema: z.object({
			linktext: z.string().min(1),
			sourcePath: z.string().optional(),
		}),
	});

	execute(args: Record<string, unknown>): Promise<ToolResult> {
		try {
			const linktext = args.linktext as string;
			const sourcePath = (args.sourcePath as string) ?? '';

			const { path, subpath } = parseLinktext(linktext);
			const target = this._app.metadataCache.getFirstLinkpathDest(path, sourcePath);

			if (!target || !(target instanceof TFile)) {
				return Promise.resolve({
					success: false,
					error: `Link target not found: ${linktext}`,
				});
			}

			const result: {
				path: string;
				subpath: string;
				resolvedSubpath?: { start: number; end: number | null } | null;
			} = { path: target.path, subpath };

			if (subpath) {
				const cache = this._app.metadataCache.getFileCache(target);
				const resolved = cache ? resolveSubpath(cache, subpath) : null;
				result.resolvedSubpath = resolved
					? { start: resolved.start.offset, end: resolved.end ? resolved.end.offset : null }
					: null;
			}

			return Promise.resolve({ success: true, result });
		} catch (error) {
			return Promise.resolve({
				success: false,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}
