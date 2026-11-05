import type { Plugin } from 'obsidian';
import type { PersistUnit, PluginSettings, SettingsDocument, SettingsPersistence, StoredSettings } from '@/features/settings';
import { applyDisabledModels, fromSettingsDocument, isSettingsDocument, toSettingsDocument, assertSettingsDocument } from '@/features/settings';
import type { PluginDataService } from '@/bootstrap/plugin-data-service';
import type { LegacySettingsFiles, LegacySettings } from '@/adapters/persistence/legacy-settings-files';

export class ObsidianSettingsPersistence implements SettingsPersistence {
	private saved: SettingsDocument | null = null;
	private legacy: LegacySettings | null = null;

	constructor(
		private readonly plugin: Plugin,
		private readonly data: PluginDataService,
		private readonly legacyFiles: LegacySettingsFiles,
		private readonly dataPath = `${plugin.manifest.dir ?? `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}`}/data.json`,
	) {}

	async read(): Promise<StoredSettings> {
		const stored = await this.loadData();
		if (isSettingsDocument(stored)) {
			assertSettingsDocument(stored);
			this.saved = stored;
			this.legacy = null;
			return { userConfig: stored.config, legacyData: null, outdated: false };
		}
		if (stored !== null && (!stored || typeof stored !== 'object' || Array.isArray(stored) || 'format' in stored)) throw new Error('Unsupported or invalid settings document; existing data was preserved.');
		this.saved = null;
		if (stored && typeof stored === 'object') {
			await this.legacyFiles.backUp(stored);
		}
		this.legacy = await this.legacyFiles.read();
		return { userConfig: this.legacy.userConfig, legacyData: this.legacy.userConfig ? null : stored, outdated: true };
	}

	async hydrate(settings: PluginSettings): Promise<Partial<PluginSettings>> {
		const overlay: Partial<PluginSettings> = this.saved ? fromSettingsDocument(this.saved).stored : { ...this.legacy?.stored };
		const providers = overlay.llmConfigs ?? settings.llmConfigs;
		await this.data.modelCacheRepository.applyCacheToConfigs(providers);
		applyDisabledModels(providers);
		await this.data.applyMcpToolCaches(overlay.mcpServers ?? settings.mcpServers);
		return overlay;
	}

	async write(settings: PluginSettings, units: ReadonlySet<PersistUnit>): Promise<void> {
		const adapter = this.plugin.app.vault.adapter;
		if (await adapter.exists(this.dataPath)) await adapter.write(`${this.dataPath}.bak`, await adapter.read(this.dataPath));
		await this.plugin.saveData(toSettingsDocument(settings));
		if (units.has('providers')) {
			await this.data.modelCacheRepository.saveFromConfigs(settings.llmConfigs).catch(error => console.error('Settings committed; model cache could not be saved:', error));
		}
		if (units.has('mcp')) {
			await this.data.persistMcpToolCaches(settings.mcpServers).catch(error => console.error('Settings committed; MCP cache could not be saved:', error));
		}
		if (this.legacy?.found) {
			await this.legacyFiles.remove();
			this.legacy = null;
		}
	}

	private async loadData(): Promise<unknown> {
		const adapter = this.plugin.app.vault.adapter;
		if (!await adapter.exists(this.dataPath)) return null;
		try { return JSON.parse(await adapter.read(this.dataPath)) as unknown; }
		catch { throw new Error('Settings could not be read. The existing data.json was preserved; restore or repair it before continuing.'); }
	}
}
