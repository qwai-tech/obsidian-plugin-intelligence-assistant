import { App, TFile } from 'obsidian';
import { Tool, ToolDefinition, ToolResult } from './types';

export class SearchFilesTool implements Tool {
	constructor(private _app: App) {}

	definition: ToolDefinition = {
		name: 'search_files',
		description: 'Search for files by name or content in the vault',
		parameters: [
			{
				name: 'query',
				type: 'string',
				description: 'Search query',
				required: true
			},
			{
				name: 'search_content',
				type: 'boolean',
				description: 'Whether to search in file contents (default: false)',
				required: false
			},
			{
				name: 'limit',
				type: 'number',
				description: 'Maximum number of results (default: 10)',
				required: false
			}
		]
	};

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		try {
			const query = (args.query as string).toLowerCase();
			const searchContent = args.search_content as boolean || false;
			const limit = args.limit as number || 10;

			const files = this._app.vault.getMarkdownFiles();
			const results: Array<{ path: string; name: string; matches?: string[] }> = [];

			for (const file of files) {
				// Search by filename
				if (file.name.toLowerCase().includes(query)) {
					results.push({
						path: file.path,
						name: file.name
					});
					continue;
				}

				// Search by content if enabled
				if (searchContent) {
					const content = await this._app.vault.read(file);
					if (content.toLowerCase().includes(query)) {
						// Extract matching lines
						const lines = content.split('\n');
						const matches = lines
							.filter(line => line.toLowerCase().includes(query))
							.slice(0, 3);

						results.push({
							path: file.path,
							name: file.name,
							matches
						});
					}
				}

				if (results.length >= limit) break;
			}

			return {
				success: true,
				result: results
			};
		} catch (error: unknown) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}
}

export class CreateNoteTool implements Tool {
	constructor(private _app: App) {}

	definition: ToolDefinition = {
		name: 'create_note',
		description: 'Create a new note with the specified content',
		parameters: [
			{
				name: 'title',
				type: 'string',
				description: 'Title/name of the note',
				required: true
			},
			{
				name: 'content',
				type: 'string',
				description: 'Content of the note',
				required: true
			},
			{
				name: 'folder',
				type: 'string',
				description: 'Folder path to create the note in (optional)',
				required: false
			}
		]
	};

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		try {
			const title = args.title as string;
			const content = args.content as string;
			const folder = args.folder as string || '';

			// Sanitize title
			const sanitized = title.replace(/[\\/:*?"<>|]/g, '-');
			const path = folder ? `${folder}/${sanitized}.md` : `${sanitized}.md`;

			// Check if file already exists
			const existing = this._app.vault.getAbstractFileByPath(path);
			if (existing) {
				return {
					success: false,
					error: `File already exists: ${path}`
				};
			}

			await this._app.vault.create(path, content);
			return {
				success: true,
				result: `Note created: ${path}`
			};
		} catch (error: unknown) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}
}

export class AppendToNoteTool implements Tool {
	constructor(private _app: App) {}

	definition: ToolDefinition = {
		name: 'append_to_note',
		description: 'Append content to an existing note',
		parameters: [
			{
				name: 'path',
				type: 'string',
				description: 'Path to the note',
				required: true
			},
			{
				name: 'content',
				type: 'string',
				description: 'Content to append',
				required: true
			}
		]
	};

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		try {
			const path = args.path as string;
			const content = args.content as string;
			const file = this._app.vault.getAbstractFileByPath(path);

			if (!file || !(file instanceof TFile)) {
				return {
					success: false,
					error: `File not found: ${path}`
				};
			}

			const existing = await this._app.vault.read(file);
			await this._app.vault.modify(file, existing + '\n\n' + content);

			return {
				success: true,
				result: `Content appended to: ${path}`
			};
		} catch (error: unknown) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}
}
