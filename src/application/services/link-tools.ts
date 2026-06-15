import { App, TFile } from 'obsidian';
import { Tool, ToolDefinition, ToolResult } from './types';
import { createToolDefinition } from '@/application/tools/tool-schema';
import { z } from 'zod';

/**
 * MakeLinkTool — produce a vault-correct link to a note using
 * `fileManager.generateMarkdownLink`, so the link honours the user's link
 * settings (wikilink vs markdown, shortest/relative/absolute path, alias)
 * instead of a hardcoded `[[name]]`.
 */
export class MakeLinkTool implements Tool {
	constructor(private _app: App) {}

	definition: ToolDefinition = createToolDefinition({
		name: 'make_link',
		description:
			'Build a vault-correct link to a note (honouring the user link settings) that can be inserted into note content.',
		parameters: [
			{
				name: 'path',
				type: 'string',
				description: 'Path to the note to link to',
				required: true,
			},
			{
				name: 'sourcePath',
				type: 'string',
				description: 'Path of the note the link will be inserted into (used for relative/shortest links)',
				required: false,
			},
			{
				name: 'alias',
				type: 'string',
				description: 'Optional display alias for the link',
				required: false,
			},
		],
		inputSchema: z.object({
			path: z.string().min(1),
			sourcePath: z.string().optional(),
			alias: z.string().optional(),
		}),
	});

	execute(args: Record<string, unknown>): Promise<ToolResult> {
		try {
			const path = args.path as string;
			const sourcePath = (args.sourcePath as string) ?? '';
			const alias = args.alias as string | undefined;

			const file = this._app.vault.getAbstractFileByPath(path);
			if (!file || !(file instanceof TFile)) {
				return Promise.resolve({ success: false, error: `File not found: ${path}` });
			}

			const link = this._app.fileManager.generateMarkdownLink(
				file,
				sourcePath,
				undefined,
				alias,
			);

			return Promise.resolve({ success: true, result: link });
		} catch (error) {
			return Promise.resolve({
				success: false,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}
