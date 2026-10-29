import type { CLIToolPreset } from '@/features/tools/types/cli-tools';

export const DATA_PRESETS: CLIToolPreset[] = [
	{
		id: 'preset-jq',
		name: 'JSON Processor (jq)',
		category: 'data',
		platforms: ['darwin', 'linux'],
		config: {
			name: 'process_json',
			description: 'Process JSON data using jq',
			command: 'jq',
			args: ['{{filter}}', '{{file}}'],
			parameters: [
				{
					name: 'filter',
					type: 'string',
					description: 'jq filter expression (e.g., ".name", ".items[]")',
					required: true,
					insertAs: 'template'
				},
				{
					name: 'file',
					type: 'string',
					description: 'JSON file path (use "-" for stdin)',
					required: false,
					default: '-',
					insertAs: 'template'
				}
			]
		}
	},
	{
		id: 'preset-wc',
		name: 'Word Count (wc)',
		category: 'data',
		platforms: ['darwin', 'linux'],
		config: {
			name: 'word_count',
			description: 'Count lines, words, and characters in a file',
			command: 'wc',
			args: ['{{file}}'],
			parameters: [
				{
					name: 'file',
					type: 'string',
					description: 'File to count',
					required: true,
					insertAs: 'template'
				}
			]
		}
	}
];
