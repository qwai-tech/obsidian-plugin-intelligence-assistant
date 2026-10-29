import type { CLIToolPreset } from '@/features/tools/types/cli-tools';

export const FILE_PRESETS: CLIToolPreset[] = [
	{
		id: 'preset-cat',
		name: 'Read File (cat)',
		category: 'file',
		platforms: ['darwin', 'linux'],
		config: {
			name: 'cat_file',
			description: 'Read and display the contents of a file',
			command: 'cat',
			args: ['{{file_path}}'],
			parameters: [
				{
					name: 'file_path',
					type: 'string',
					description: 'Path to the file to read',
					required: true,
					insertAs: 'template'
				}
			]
		}
	},
	{
		id: 'preset-ls',
		name: 'List Directory (ls)',
		category: 'file',
		platforms: ['darwin', 'linux'],
		config: {
			name: 'list_directory',
			description: 'List files and directories in a path',
			command: 'ls',
			args: ['-la', '{{path}}'],
			parameters: [
				{
					name: 'path',
					type: 'string',
					description: 'Directory path to list (default: current directory)',
					required: false,
					default: '.',
					insertAs: 'template'
				}
			]
		}
	},
	{
		id: 'preset-find',
		name: 'Find Files (find)',
		category: 'search',
		platforms: ['darwin', 'linux'],
		config: {
			name: 'find_files',
			description: 'Find files matching a pattern in a directory',
			command: 'find',
			args: ['{{directory}}', '-name', '{{pattern}}'],
			parameters: [
				{
					name: 'directory',
					type: 'string',
					description: 'Directory to search in',
					required: true,
					insertAs: 'template'
				},
				{
					name: 'pattern',
					type: 'string',
					description: 'File name pattern (e.g., "*.txt", "*.md")',
					required: true,
					insertAs: 'template'
				}
			]
		}
	}
];
