import type { Conversation } from '@/features/conversations';
import type { PluginSettings, UserConfig } from '@/features/settings/types/settings';
import { pluginSettingsToUserConfig, userConfigToPluginSettings } from './settings-codec';
import { migrateSettings } from './settings-migrations';
import { moveKeysToVault, revealKeys, withoutKeys, type SecretVault } from './settings-secrets';

export type PersistUnit = 'config' | 'providers' | 'prompts' | 'agents' | 'mcp';

export interface StoredSettings {
	userConfig: UserConfig | null;
	legacyData: unknown;
}

export interface SettingsPersistence {
	read(): Promise<StoredSettings>;
	hydrate(settings: PluginSettings): Promise<Partial<PluginSettings>>;
	write(settings: PluginSettings, units: ReadonlySet<PersistUnit>): Promise<void>;
}

const UNITS: Record<PersistUnit, (settings: PluginSettings) => unknown> = {
	config: (settings) => pluginSettingsToUserConfig(settings),
	providers: (settings) => settings.llmConfigs,
	prompts: (settings) => [settings.systemPrompts, settings.activeSystemPromptId],
	agents: (settings) => [settings.agents, settings.activeAgentId],
	mcp: (settings) => settings.mcpServers,
};

export class SettingsStore {
	private settings: PluginSettings | null = null;
	private conversations: Conversation[] = [];
	private snapshots = new Map<PersistUnit, string>();
	private readonly listeners = new Set<(units: ReadonlySet<PersistUnit>) => void>();

	constructor(
		private readonly persistence: SettingsPersistence,
		private readonly vault: SecretVault,
	) {}

	get current(): PluginSettings {
		if (!this.settings) {
			throw new Error('Settings have not been loaded');
		}
		return this.settings;
	}

	peek(): PluginSettings | null {
		return this.settings;
	}

	get legacyConversations(): Conversation[] {
		return this.conversations;
	}

	async load(): Promise<void> {
		const { userConfig, legacyData } = await this.persistence.read();
		const legacy = userConfig ? null : asLegacySettings(legacyData);
		const settings: PluginSettings = { ...userConfigToPluginSettings(userConfig), ...legacy };
		this.conversations = legacy?.conversations ?? [];
		Object.assign(settings, await this.persistence.hydrate(settings));

		const migrated = migrateSettings(settings);
		const keysMoved = moveKeysToVault(settings, this.vault);
		revealKeys(settings, this.vault);
		this.settings = settings;
		this.snapshots = this.snapshot(settings);
		const pending = new Set<PersistUnit>();
		if (!userConfig) pending.add('config');
		if (migrated) pending.add('agents').add('config').add('providers');
		if (keysMoved) pending.add('providers').add('config');
		if (pending.size > 0) {
			await this.persistence.write(withoutKeys(settings), pending);
		}
	}

	async save(): Promise<void> {
		const settings = this.current;
		const next = this.snapshot(settings);
		const changed = new Set<PersistUnit>([...next].filter(([unit, value]) => this.snapshots.get(unit) !== value).map(([unit]) => unit));
		if (changed.size === 0) {
			return;
		}
		await this.persistence.write(withoutKeys(settings), changed);
		this.snapshots = next;
		for (const listener of this.listeners) {
			listener(changed);
		}
	}

	async update(change: (settings: PluginSettings) => void): Promise<void> {
		change(this.current);
		revealKeys(this.current, this.vault);
		await this.save();
	}

	refreshKeys(): void {
		revealKeys(this.current, this.vault);
	}

	onChange(listener: (units: ReadonlySet<PersistUnit>) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private snapshot(settings: PluginSettings): Map<PersistUnit, string> {
		const stored = withoutKeys(settings);
		return new Map((Object.keys(UNITS) as PersistUnit[]).map((unit) => [unit, JSON.stringify(UNITS[unit](stored))]));
	}
}

function asLegacySettings(data: unknown): Partial<PluginSettings> | null {
	return data && typeof data === 'object' ? data as Partial<PluginSettings> : null;
}
