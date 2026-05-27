import { App, TFile } from 'obsidian';
import { Tool, ToolDefinition, ToolResult } from './types';

interface WriteProposal {
	type: 'write_proposal';
	operation: 'create' | 'update' | 'append';
	path: string;
	content: string;
	previousContent?: string;
	proposedContent: string;
	applied: false;
	reason: string;
}

export function createWriteProposal(input: {
	operation: WriteProposal['operation'];
	path: string;
	content: string;
	previousContent?: string;
	proposedContent?: string;
}): WriteProposal {
	return {
		type: 'write_proposal',
		operation: input.operation,
		path: input.path,
		content: input.content,
		previousContent: input.previousContent,
		proposedContent: input.proposedContent ?? input.content,
		applied: false,
		reason: 'Vault write was not applied. Review this proposal and explicitly confirm before making changes.',
	};
}

export class ReadFileTool implements Tool {
	constructor(private _app: App) {}

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

	definition: ToolDefinition = {
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
		]
	};

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

  execute(args: Record<string, unknown>): Promise<ToolResult> {
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

			return Promise.resolve({
				success: true,
				result: fileList
			});
		} catch (error) {
			return Promise.resolve({
				success: false,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}
}
