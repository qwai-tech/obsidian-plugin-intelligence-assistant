import type { Plugin } from 'obsidian';
import type { PluginSettings, UserConfig, PersistUnit, SettingsPersistence, StoredSettings } from '@/features/settings';
import { pluginSettingsToUserConfig } from '@/features/settings';
import type { PluginDataService } from '@/bootstrap/plugin-data-service';
import { JsonFile } from '@/adapters/persistence/json-file';

export class ObsidianSettingsPersistence implements SettingsPersistence {
	private readonly configFile: JsonFile<UserConfig | null>;

	constructor(
		private readonly plugin: Plugin,
		private readonly data: PluginDataService,
		configPath: string,
	) {
		this.configFile = new JsonFile<UserConfig | null>(plugin.app.vault.adapter, configPath, () => null);
	}

	async read(): Promise<StoredSettings> {
		const [userConfig, legacyData] = await Promise.all([this.configFile.read(), this.readLegacyData()]);
		return { userConfig, legacyData };
	}

	async hydrate(settings: PluginSettings): Promise<Partial<PluginSettings>> {
		return await this.data.hydrateAll(settings);
	}

	async write(settings: PluginSettings, units: ReadonlySet<PersistUnit>): Promise<void> {
		await this.data.persist(settings, units);
		if (units.has('config')) {
			await this.configFile.write(pluginSettingsToUserConfig(settings));
		}
	}

	private async readLegacyData(): Promise<unknown> {
		try {
			return await this.plugin.loadData() as unknown;
		} catch (error) {
			console.debug('No legacy data found', error);
			return null;
		}
	}
}
