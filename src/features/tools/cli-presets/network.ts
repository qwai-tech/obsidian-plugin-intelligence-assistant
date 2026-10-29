import type { CLIToolPreset } from '@/features/tools/types/cli-tools';

export const NETWORK_PRESETS: CLIToolPreset[] = [
	{
		id: 'preset-curl',
		name: 'HTTP Request (curl)',
		category: 'network',
		platforms: ['darwin', 'linux'],
		config: {
			name: 'http_request',
			description: 'Make an HTTP request to a URL',
			command: 'curl',
			args: ['-s', '{{url}}'],
			parameters: [
				{
					name: 'url',
					type: 'string',
					description: 'URL to fetch',
					required: true,
					insertAs: 'template'
				}
			]
		}
	},
	{
		id: 'preset-curl-post',
		name: 'HTTP POST (curl)',
		category: 'network',
		platforms: ['darwin', 'linux'],
		config: {
			name: 'http_post',
			description: 'Make an HTTP POST request with JSON data',
			command: 'curl',
			args: ['-s', '-X', 'POST', '-H', 'Content-Type: application/json', '-d', '{{data}}', '{{url}}'],
			parameters: [
				{
					name: 'url',
					type: 'string',
					description: 'URL to post to',
					required: true,
					insertAs: 'template'
				},
				{
					name: 'data',
					type: 'string',
					description: 'JSON data to send',
					required: true,
					insertAs: 'template'
				}
			]
		}
	}
];
