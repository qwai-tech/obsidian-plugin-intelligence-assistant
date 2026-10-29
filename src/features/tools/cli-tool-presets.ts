import { DEFAULT_CLI_TIMEOUT, type CLIToolConfig, type CLIToolPreset } from '@/features/tools/types/cli-tools';
import { FILE_PRESETS } from './cli-presets/files';
import { SEARCH_PRESETS } from './cli-presets/search';
import { NETWORK_PRESETS } from './cli-presets/network';
import { CODE_PRESETS } from './cli-presets/code';
import { DATA_PRESETS } from './cli-presets/data';
import { SYSTEM_PRESETS } from './cli-presets/system';
import { MACOS_APP_PRESETS } from './cli-presets/macos-apps';

export const CLI_TOOL_DEFAULTS: Partial<CLIToolConfig> = {
	enabled: true,
	timeout: DEFAULT_CLI_TIMEOUT,
	shell: true,
	args: [],
	parameters: []
};

export const CLI_TOOL_PRESETS: CLIToolPreset[] = [
	...FILE_PRESETS,
	...SEARCH_PRESETS,
	...NETWORK_PRESETS,
	...CODE_PRESETS,
	...DATA_PRESETS,
	...SYSTEM_PRESETS,
	...MACOS_APP_PRESETS,
];

export function availablePresets(platform: string): CLIToolPreset[] {
	return CLI_TOOL_PRESETS.filter(preset => (preset.platforms as string[]).includes(platform));
}

export const PRESET_CATEGORIES: Record<CLIToolPreset['category'], string> = {
	file: 'File Operations',
	search: 'Search',
	network: 'Network',
	code: 'Code Execution',
	data: 'Data Processing',
	system: 'System Information',
	apps: 'macOS Apps & Desktop'
};
