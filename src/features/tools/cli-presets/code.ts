import type { CLIToolPreset } from '@/features/tools/types/cli-tools';

export const CODE_PRESETS: CLIToolPreset[] = [
	{
		id: 'preset-python',
		name: 'Run Python Code',
		category: 'code',
		platforms: ['darwin', 'linux', 'win32'],
		config: {
			name: 'run_python',
			description: 'Execute Python code and return the output',
			command: 'python3',
			args: ['-c', '{{code}}'],
			timeout: 60000,
			parameters: [
				{
					name: 'code',
					type: 'string',
					description: 'Python code to execute',
					required: true,
					insertAs: 'template'
				}
			]
		}
	},
	{
		id: 'preset-node',
		name: 'Run JavaScript (Node)',
		category: 'code',
		platforms: ['darwin', 'linux', 'win32'],
		config: {
			name: 'run_javascript',
			description: 'Execute JavaScript code using Node.js',
			command: 'node',
			args: ['-e', '{{code}}'],
			timeout: 60000,
			parameters: [
				{
					name: 'code',
					type: 'string',
					description: 'JavaScript code to execute',
					required: true,
					insertAs: 'template'
				}
			]
		}
	},
	{
		id: 'preset-bash',
		name: 'Run Shell Script',
		category: 'code',
		platforms: ['darwin', 'linux'],
		config: {
			name: 'run_shell',
			description: 'Execute a shell command or script',
			command: 'bash',
			args: ['-c', '{{script}}'],
			parameters: [
				{
					name: 'script',
					type: 'string',
					description: 'Shell command or script to execute',
					required: true,
					insertAs: 'template'
				}
			]
		}
	}
];
