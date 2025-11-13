import { App, TFile } from 'obsidian';
import { Tool, ToolDefinition, ToolResult } from './types';

export class ReadFileTool implements Tool {
	constructor(private app: App) {}

	definition: ToolDefinition = {
		name: 'read_file',
		description: 'Read the contents of a file from the vault',
		parameters: [
			{
				name: 'path',
				type: 'string',
				description: 'Path to the file to read',
				required: true
			}
		]
	};

	async execute(args: Record<string, any>): Promise<ToolResult> {
		try {
			const path = args.path as string;
			const file = this.app.vault.getAbstractFileByPath(path);

			if (!file || !(file instanceof TFile)) {
				return {
					success: false,
					error: `File not found: ${path}`
				};
			}

			const content = await this.app.vault.read(file);
			return {
				success: true,
				result: content
			};
		} catch (error) {
			return {
				success: false,
				error: error.message
			};
		}
	}
}

export class WriteFileTool implements Tool {
	constructor(private app: App) {}

	definition: ToolDefinition = {
		name: 'write_file',
		description: 'Write or update a file in the vault',
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
		]
	};

	async execute(args: Record<string, any>): Promise<ToolResult> {
		try {
			const path = args.path as string;
			const content = args.content as string;
			const file = this.app.vault.getAbstractFileByPath(path);

			if (file && file instanceof TFile) {
				// File exists, update it
				await this.app.vault.modify(file, content);
				return {
					success: true,
					result: `File updated: ${path}`
				};
			} else {
				// Create new file
				await this.app.vault.create(path, content);
				return {
					success: true,
					result: `File created: ${path}`
				};
			}
		} catch (error) {
			return {
				success: false,
				error: error.message
			};
		}
	}
}

export class ListFilesTool implements Tool {
	constructor(private app: App) {}

	definition: ToolDefinition = {
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
		]
	};

	async execute(args: Record<string, any>): Promise<ToolResult> {
		try {
			const folderPath = args.folder as string || '';
			const extension = args.extension as string;

			let files = this.app.vault.getFiles();

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
				error: error.message
			};
		}
	}
}
