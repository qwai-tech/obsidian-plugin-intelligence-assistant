import type { CLIToolPreset } from '@/features/tools/types/cli-tools';

export const SYSTEM_PRESETS: CLIToolPreset[] = [
	{
		id: 'preset-date',
		name: 'Current Date/Time',
		category: 'system',
		platforms: ['darwin', 'linux'],
		config: {
			name: 'get_datetime',
			description: 'Get the current date and time',
			command: 'date',
			args: [],
			parameters: []
		}
	},
	{
		id: 'preset-pwd',
		name: 'Current Directory (pwd)',
		category: 'system',
		platforms: ['darwin', 'linux'],
		config: {
			name: 'get_cwd',
			description: 'Get the current working directory',
			command: 'pwd',
			args: [],
			parameters: []
		}
	},
	{
		id: 'preset-whoami',
		name: 'Current User',
		category: 'system',
		platforms: ['darwin', 'linux'],
		config: {
			name: 'get_user',
			description: 'Get the current username',
			command: 'whoami',
			args: [],
			parameters: []
		}
	},
	{
		id: 'preset-uname',
		name: 'System Info (uname)',
		category: 'system',
		platforms: ['darwin', 'linux'],
		config: {
			name: 'system_info',
			description: 'Get system information (OS, kernel version, etc.)',
			command: 'uname',
			args: ['-a'],
			parameters: []
		}
	}
];
