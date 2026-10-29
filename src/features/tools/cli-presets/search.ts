import type { CLIToolPreset } from '@/features/tools/types/cli-tools';

export const SEARCH_PRESETS: CLIToolPreset[] = [
	{
		id: 'preset-grep',
		name: 'Search Text (grep)',
		category: 'search',
		platforms: ['darwin', 'linux'],
		config: {
			name: 'grep_search',
			description: 'Search for a pattern in files',
			command: 'grep',
			args: ['-rn', '{{pattern}}', '{{path}}'],
			parameters: [
				{
					name: 'pattern',
					type: 'string',
					description: 'Text pattern to search for',
					required: true,
					insertAs: 'template'
				},
				{
					name: 'path',
					type: 'string',
					description: 'File or directory to search in',
					required: true,
					insertAs: 'template'
				}
			]
		}
	},
	{
		id: 'preset-ripgrep',
		name: 'Fast Search (rg)',
		category: 'search',
		platforms: ['darwin', 'linux'],
		config: {
			name: 'ripgrep_search',
			description: 'Fast text search using ripgrep',
			command: 'rg',
			args: ['--line-number', '{{pattern}}', '{{path}}'],
			parameters: [
				{
					name: 'pattern',
					type: 'string',
					description: 'Text pattern to search for (regex supported)',
					required: true,
					insertAs: 'template'
				},
				{
					name: 'path',
					type: 'string',
					description: 'File or directory to search in',
					required: false,
					default: '.',
					insertAs: 'template'
				}
			]
		}
	}
];
