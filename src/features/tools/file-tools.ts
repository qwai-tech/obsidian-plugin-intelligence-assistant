import { App, TFile, stringifyYaml } from 'obsidian';
import { Tool, ToolDefinition, ToolResult } from '@/features/tools/types/tools';
import { createWriteProposal } from '@/features/agent';
import { createToolDefinition } from '@/features/tools/tool-schema';
import * as z from 'zod/mini';
import { errorMessage } from '@/core/utils/errors';
import { vaultPath } from './vault-path';

export class ReadFileTool implements Tool {
	constructor(private _app: App) {}

	definition: ToolDefinition = createToolDefinition({
		name: 'read_file',
		description: 'Read the contents of a file from the vault',
		parameters: [
			{
				name: 'path',
				type: 'string',
				description: 'Path to the file to read',
				required: true
			}
		],
		inputSchema: z.object({ path: z.string().check(z.minLength(1)) }),
	});

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		try {
			const path = vaultPath(args.path);
			const file = this._app.vault.getAbstractFileByPath(path);

			if (!file || !(file instanceof TFile)) {
				return {
					success: false,
					error: `File not found: ${path}`
				};
			}

			const content = await this._app.vault.read(file);
			return {
				success: true,
				result: content
			};
		} catch (error) {
			return {
				success: false,
				error: errorMessage(error)
			};
		}
	}
}

export class WriteFileTool implements Tool {
	constructor(private _app: App) {}

	definition: ToolDefinition = createToolDefinition({
		name: 'write_file',
		description: 'Prepare a proposal to write or update a vault file. This does not modify the vault until the user confirms.',
		parameters: [
			{
				name: 'path',
				type: 'string',
				description: 'Path to the file to write',
				required: true
			},
			{
				name: 'content',
				type: 'string',
				description: 'Content to write to the file',
				required: true
			}
		],
		inputSchema: z.object({
			path: z.string().check(z.minLength(1)),
			content: z.string(),
		}),
		sideEffects: { vaultWrite: true },
	});

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		try {
			const path = vaultPath(args.path);
			const content = args.content as string;
			const file = this._app.vault.getAbstractFileByPath(path);

			if (file && file instanceof TFile) {
				const previousContent = await this._app.vault.read(file);
				return {
					success: true,
					result: createWriteProposal({
						operation: 'update',
						path,
						content,
						previousContent,
						proposedContent: content,
					})
				};
			} else {
				return {
					success: true,
					result: createWriteProposal({
						operation: 'create',
						path,
						content,
						proposedContent: content,
					})
				};
			}
		} catch (error) {
			return {
				success: false,
				error: errorMessage(error)
			};
		}
	}
}

export class ListFilesTool implements Tool {
	constructor(private _app: App) {}

	definition: ToolDefinition = createToolDefinition({
		name: 'list_files',
		description: 'List files in the vault or a specific folder',
		parameters: [
			{
				name: 'folder',
				type: 'string',
				description: 'Folder path to list files from (empty for root)',
				required: false
			},
			{
				name: 'extension',
				type: 'string',
				description: 'Filter by file extension (e.g., "md")',
				required: false
			}
		],
		inputSchema: z.object({
			folder: z.optional(z.string()),
			extension: z.optional(z.string()),
		}),
	});

	execute(args: Record<string, unknown>): Promise<ToolResult> {
		try {
			const folderPath = vaultPath(args.folder);
			const extension = args.extension as string;

			let files = this._app.vault.getFiles();

			// Filter by folder
			if (folderPath) {
				files = files.filter(f => f.path.startsWith(folderPath));
			}

			// Filter by extension
			if (extension) {
				files = files.filter(f => f.extension === extension);
			}

			const fileList = files.map(f => ({
				path: f.path,
				name: f.name,
				extension: f.extension
			}));

			return Promise.resolve({
				success: true,
				result: fileList
			});
		} catch (error) {
			return Promise.resolve({
				success: false,
				error: errorMessage(error)
			});
		}
	}
}

export class UpdatePropertiesTool implements Tool {
	constructor(private _app: App) {}

	definition: ToolDefinition = createToolDefinition({
		name: 'update_properties',
		description: 'Update the YAML Frontmatter (Properties) of a note. Supports adding, updating, or removing tags and keys.',
		parameters: [
			{
				name: 'path',
				type: 'string',
				description: 'Path to the note to update',
				required: true
			},
			{
				name: 'updates',
				type: 'object',
				description: 'Properties to update (key-value pairs)',
				required: true
			},
			{
				name: 'deleteKeys',
				type: 'array',
				description: 'List of keys to delete from Properties',
				required: false
			}
		],
		inputSchema: z.object({
			path: z.string().check(z.minLength(1)),
			updates: z.record(z.string(), z.any()),
			deleteKeys: z.optional(z.array(z.string())),
		}),
		sideEffects: { vaultWrite: true },
	});

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		try {
			const path = vaultPath(args.path);
			const updates = args.updates as Record<string, unknown>;
			const deleteKeys = (args.deleteKeys as string[]) || [];
			const file = this._app.vault.getAbstractFileByPath(path);

			if (!file || !(file instanceof TFile)) {
				return { success: false, error: `File not found: ${path}` };
			}

			const content = await this._app.vault.read(file);
			const metadata = this._app.metadataCache.getFileCache(file)?.frontmatter || {};
			
			const newMetadata: Record<string, unknown> = { ...metadata };
			// Apply updates
			for (const [key, value] of Object.entries(updates)) {
				newMetadata[key] = value;
			}
			// Apply deletions
			for (const key of deleteKeys) {
				delete newMetadata[key];
			}
			// Remove the automatically added 'position' key if it exists
			delete newMetadata.position;

			const body = content.replace(/^---[\s\S]*?---\n?/, '');
			// Serialize with Obsidian's YAML serializer (handles escaping, arrays,
			// nesting, multiline) instead of hand-rolled string concatenation. If all
			// properties were removed, emit no frontmatter block at all.
			const proposedContent = Object.keys(newMetadata).length > 0
				? `---\n${stringifyYaml(newMetadata)}---\n${body}`
				: body;

			return {
				success: true,
				result: createWriteProposal({
					operation: 'update',
					path,
					proposedContent,
					previousContent: content,
					reason: `Update properties for ${path}: ${Object.keys(updates).join(', ')}`
				})
			};
		} catch (error) {
			return {
				success: false,
				error: errorMessage(error)
			};
		}
	}
}

