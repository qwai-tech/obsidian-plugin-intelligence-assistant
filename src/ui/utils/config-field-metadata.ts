import { Setting } from 'obsidian';

export interface ConfigFieldMetadataOptions {
	path: string;
	label: string;
	description?: string;
}

const REQUIRED_FIELDS = new Set([
	'llmConfigs[].provider',
	'mcpServers[].name',
	'mcpServers[].command',
	'agents[].id',
	'agents[].name',
	'agents[].modelStrategy.strategy',
]);

const RANGES: Record<string, [number, number]> = {
	temperature: [0, 2],
	similarityThreshold: [0, 1],
};

export function applyConfigFieldMetadata(setting: Setting, options: ConfigFieldMetadataOptions): Setting {
	const range = RANGES[options.path.split('.').pop() ?? ''];
	setting.setName(options.label);
	const description = [options.description, range && `(${range[0]}–${range[1]})`].filter(Boolean).join(' ');
	if (description) {
		setting.setDesc(description);
	}
	if (REQUIRED_FIELDS.has(options.path)) {
		setting.nameEl.addClass('ia-setting-label--required');
		setting.nameEl.setAttr('data-required', 'true');
	}
	return setting;
}
