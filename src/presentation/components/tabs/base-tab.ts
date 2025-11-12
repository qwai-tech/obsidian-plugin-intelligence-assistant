import type { App } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';

export interface ISettingsTab {
	render(containerEl: HTMLElement): void | Promise<void>;
}

export abstract class BaseSettingsTab implements ISettingsTab {
	constructor(
		protected app: App,
		protected plugin: IntelligenceAssistantPlugin
	) {}

	abstract render(containerEl: HTMLElement): void | Promise<void>;
}
