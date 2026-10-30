import type { Plugin } from 'obsidian';
import type { PersistUnit, PluginSettings, SettingsDocument, SettingsPersistence, StoredSettings } from '@/features/settings';
import { fromSettingsDocument, isSettingsDocument, toSettingsDocument } from '@/features/settings';
import type { PluginDataService } from '@/bootstrap/plugin-data-service';
import type { LegacySettingsFiles, LegacySettings } from '@/adapters/persistence/legacy-settings-files';

export class ObsidianSettingsPersistence implements SettingsPersistence {
	private saved: SettingsDocument | null = null;
	private legacy: LegacySettings | null = null;

	constructor(
		private readonly plugin: Plugin,
		private readonly data: PluginDataService,
		private readonly legacyFiles: LegacySettingsFiles,
	) {}

	async read(): Promise<StoredSettings> {
		const stored = await this.loadData();
		if (isSettingsDocument(stored)) {
			this.saved = stored;
			this.legacy = null;
			return { userConfig: stored.config, legacyData: null, outdated: false };
		}
		this.saved = null;
		if (stored && typeof stored === 'object') {
			await this.legacyFiles.backUp(stored);
		}
		this.legacy = await this.legacyFiles.read();
		return { userConfig: this.legacy.userConfig, legacyData: this.legacy.userConfig ? null : stored, outdated: true };
	}

	async hydrate(settings: PluginSettings): Promise<Partial<PluginSettings>> {
		const overlay: Partial<PluginSettings> = this.saved ? fromSettingsDocument(this.saved).stored : { ...this.legacy?.stored };
		await this.data.modelCacheRepository.applyCacheToConfigs(overlay.llmConfigs ?? settings.llmConfigs);
		await this.data.applyMcpToolCaches(overlay.mcpServers ?? settings.mcpServers);
		return overlay;
	}

	async write(settings: PluginSettings, units: ReadonlySet<PersistUnit>): Promise<void> {
		await this.plugin.saveData(toSettingsDocument(settings));
		if (units.has('providers')) {
			await this.data.modelCacheRepository.saveFromConfigs(settings.llmConfigs);
		}
		if (units.has('mcp')) {
			await this.data.persistMcpToolCaches(settings.mcpServers);
		}
		if (this.legacy?.found) {
			await this.legacyFiles.remove();
			this.legacy = null;
		}
	}

	private async loadData(): Promise<unknown> {
		try {
			return await this.plugin.loadData() as unknown;
		} catch {
			return null;
		}
	}
}
