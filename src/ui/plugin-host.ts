import type { App, PluginManifest } from 'obsidian';
import type { PluginSettings } from '@/features/settings';
import type { AppServices } from './app-services';

export interface PluginHost {
	readonly app: App;
	readonly manifest: PluginManifest;
	readonly settings: PluginSettings;
	readonly services: AppServices;
	updateSettings(change: (settings: PluginSettings) => void): Promise<void>;
}
