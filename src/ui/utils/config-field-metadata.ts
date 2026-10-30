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

export function applyConfigFieldMetadata(setting: Setting, options: ConfigFieldMetadataOptions): Setting {
	setting.setName(options.label);
	if (options.description) {
		setting.setDesc(options.description);
	}
	if (REQUIRED_FIELDS.has(options.path)) {
		setting.nameEl.addClass('ia-setting-label--required');
		setting.nameEl.setAttr('data-required', 'true');
	}
	return setting;
}
