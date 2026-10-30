import { Setting } from 'obsidian';
import { renderIcon } from '@/ui/utils/icon';

export interface ListRowOptions {
	name: string;
	icon?: string;
	badges?: string[];
	lines?: string[];
	testId?: string;
	attributes?: Record<string, string>;
}

export function renderListRow(container: HTMLElement, options: ListRowOptions): Setting {
	const setting = new Setting(container);
	setting.settingEl.addClass('ia-list-row');
	if (options.icon !== undefined) {
		renderIcon(setting.nameEl.createSpan('ia-list-row__icon'), options.icon);
	}
	setting.nameEl.appendText(options.name);
	for (const badge of options.badges ?? []) {
		setting.nameEl.createSpan({ cls: 'ia-tag ia-list-row__badge', text: badge });
	}
	for (const line of (options.lines ?? []).filter(Boolean)) {
		setting.descEl.createDiv({ text: line });
	}
	if (options.testId) {
		setting.settingEl.setAttribute('data-testid', options.testId);
	}
	for (const [name, value] of Object.entries(options.attributes ?? {})) {
		setting.settingEl.setAttribute(name, value);
	}
	return setting;
}

export function tagButton(button: HTMLButtonElement, testId: string, attributes: Record<string, string>): void {
	button.setAttribute('data-testid', testId);
	for (const [name, value] of Object.entries(attributes)) {
		button.setAttribute(name, value);
	}
}
