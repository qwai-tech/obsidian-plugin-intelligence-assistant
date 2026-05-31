import { App, TFile } from 'obsidian';
import { Tool, ToolDefinition, ToolResult } from './types';
import { createWriteProposal } from './write-proposal-service';
import { createToolDefinition } from '@/application/tools/tool-schema';
import { z } from 'zod';

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
		inputSchema: z.object({ path: z.string().min(1) }),
	});

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		try {
			const path = args.path as string;
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
				error: error instanceof Error ? error.message : String(error)
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
			path: z.string().min(1),
			content: z.string(),
		}),
		sideEffects: { vaultWrite: true },
	});

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		try {
			const path = args.path as string;
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
				error: error instanceof Error ? error.message : String(error)
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
			folder: z.string().optional(),
			extension: z.string().optional(),
		}),
	});

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		try {
			const folderPath = args.folder as string || '';
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

			return {
				success: true,
				result: fileList
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error)
			};
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
			path: z.string().min(1),
			updates: z.record(z.string(), z.any()),
			deleteKeys: z.array(z.string()).optional(),
		}),
		sideEffects: { vaultWrite: true },
	});

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		try {
			const path = args.path as string;
			const updates = args.updates as Record<string, any>;
			const deleteKeys = (args.deleteKeys as string[]) || [];
			const file = this._app.vault.getAbstractFileByPath(path);

			if (!file || !(file instanceof TFile)) {
				return { success: false, error: `File not found: ${path}` };
			}

			const content = await this._app.vault.read(file);
			const metadata = this._app.metadataCache.getFileCache(file)?.frontmatter || {};
			
			const newMetadata = { ...metadata };
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
			let newFrontmatter = '---\n';
			for (const [key, value] of Object.entries(newMetadata)) {
				if (Array.isArray(value)) {
					newFrontmatter += `${key}:\n${value.map(v => `  - ${v}`).join('\n')}\n`;
				} else if (typeof value === 'object' && value !== null) {
					newFrontmatter += `${key}: ${JSON.stringify(value)}\n`;
				} else {
					newFrontmatter += `${key}: ${value}\n`;
				}
			}
			newFrontmatter += '---\n';

			const proposedContent = newFrontmatter + body;

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
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}
}

