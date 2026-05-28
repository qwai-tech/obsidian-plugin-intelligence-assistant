// Configuration manager as specified in architecture
import { Vault } from 'obsidian';
import type { PluginSettings } from '@/types';
import { DEFAULT_SETTINGS } from '@/types/settings';
import { ConfigSchema, type ValidationResult } from './config-schema';

type ChangeRecord = {
  path: string;
  previous: unknown;
  next: unknown;
  timestamp: number;
};

const clone = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)) as T);

const normalizePath = (path: string): string[] =>
  path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);

export class ConfigManager {
  private config: PluginSettings;
  private readonly configPath: string;
  private readonly history: ChangeRecord[] = [];
  private readonly historyLimit = 100;
  private readonly saveCallback?: () => Promise<void> | void;
  private readonly vault: Vault;
  private dirty = false;

  constructor(
    vaultOrApp: Vault | { vault: Vault },
    configOrFileName: string | PluginSettings = 'intelligence-assistant.json',
    saveCallback?: () => Promise<void> | void
  ) {
    this.vault = 'vault' in vaultOrApp ? vaultOrApp.vault : vaultOrApp;
    this.saveCallback = saveCallback;

    const configFileName = typeof configOrFileName === 'string'
      ? configOrFileName
      : 'intelligence-assistant.json';
    const configDir = (this.vault as Vault & { configDir?: string }).configDir ?? '.obsidian';
    this.configPath = `${configDir}/${configFileName}`;
    this.config = typeof configOrFileName === 'string'
      ? this.getDefaultConfig()
      : clone(configOrFileName);
  }

	async load(): Promise<void> {
		const configExists = await this.vault.adapter.exists(this.configPath);
		try {
			const content = await this.vault.adapter.read(this.configPath);
			this.config = JSON.parse(content) as PluginSettings;
			this.assertValid(ConfigSchema.validate(this.config), 'load configuration');
			this.dirty = false;
		} catch (error) {
			if (configExists) {
				this.config = this.getDefaultConfig();
				this.dirty = false;
				throw error instanceof Error
					? error
					: new Error(`Failed to load config: ${String(error)}`);
			}

			// Use default config if file doesn't exist
			this.config = this.getDefaultConfig();
			this.dirty = true;
			await this.save();
		}
	}

  async save(): Promise<void> {
    if (!this.dirty) return;
    const content = JSON.stringify(this.config, null, 2);
    if (this.saveCallback) {
      await this.saveCallback();
    } else {
      await this.vault.adapter.write(this.configPath, content);
    }
    this.dirty = false;
  }

  get<K extends keyof PluginSettings>(key: K): PluginSettings[K] {
    return clone(this.config[key]);
  }

	async set<K extends keyof PluginSettings>(key: K, value: PluginSettings[K], validate = true): Promise<void> {
		const previous = clone(this.config[key]);
		const next = clone(value);

		if (validate) {
			this.assertValid(ConfigSchema.validateSection(key, next), `update ${String(key)}`);
		}

    this.config[key] = next;
    this.recordChange(String(key), previous, next);
    this.dirty = true;
    await this.save();
  }

  getPath<T = unknown>(path: string): T {
    const value = normalizePath(path).reduce((acc: unknown, segment) => {
      if (acc && typeof acc === 'object' && segment in acc) {
        return (acc as Record<string, unknown>)[segment];
      }
      return undefined;
    }, this.config as unknown);
    return clone(value) as T;
  }

	async setPath(path: string, value: unknown, validate = true): Promise<void> {
    const segments = normalizePath(path);
    const last = segments.pop();
    if (!last) return;

    const candidate = clone(this.config) as unknown as Record<string, unknown>;
    let target: Record<string, unknown> = candidate;
    for (const segment of segments) {
      if (!(segment in target) || target[segment] === null || typeof target[segment] !== 'object') {
        throw new Error(`Invalid configuration path: ${path}`);
      }
      target = target[segment] as Record<string, unknown>;
    }

		const previous = clone(this.getPath(path));
		target[last] = clone(value);

		if (validate) {
			this.assertValid(ConfigSchema.validate(candidate as unknown as PluginSettings), `update ${path}`);
		}

    this.config = candidate as unknown as PluginSettings;
    this.recordChange(path, previous, value);
    this.dirty = true;
    await this.save();
  }

  async update(partial: Partial<PluginSettings>, validate = true): Promise<void> {
    const candidate = {
      ...clone(this.config),
      ...clone(partial),
    } as PluginSettings;

    if (validate) {
      this.assertValid(ConfigSchema.validate(candidate), 'update configuration');
    }

    Object.entries(partial).forEach(([key, value]) => {
      this.recordChange(key, (this.config as unknown as Record<string, unknown>)[key], value);
    });
    this.config = candidate;
    this.dirty = true;
    await this.save();
  }

  async reset(validate = true): Promise<void> {
    const next = this.getDefaultConfig();
    if (validate) {
      this.assertValid(ConfigSchema.validate(next), 'reset configuration');
    }
    const previous = clone(this.config);
    this.config = next;
    this.recordChange('*', previous, next);
    this.dirty = true;
    await this.save();
  }

  async resetSection<K extends keyof PluginSettings>(section: K, validate = true): Promise<void> {
    await this.set(section, clone(DEFAULT_SETTINGS[section]), validate);
  }

  export(): string {
    return JSON.stringify(this.config, null, 2);
  }

  async import(json: string, validate = true): Promise<void> {
    let parsed: PluginSettings;
    try {
      parsed = JSON.parse(json) as PluginSettings;
    } catch {
      throw new Error('Invalid JSON format');
    }

    if (validate) {
      const result = ConfigSchema.validate(parsed);
      if (!result.valid) {
        const details = result.errors.map(error => `${error.path}: ${error.message}`).join('; ');
        throw new Error(`Imported settings validation failed${details ? `: ${details}` : ''}`);
      }
    }

    const previous = clone(this.config);
    this.config = clone(parsed);
    this.recordChange('*', previous, this.config);
    this.dirty = true;
    await this.save();
  }

  getChangeHistory(): ChangeRecord[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history.length = 0;
  }

  validate(): ValidationResult {
    return ConfigSchema.validate(this.config);
  }

  getDefault(path: string): unknown {
    return clone(ConfigSchema.getDefault(path));
  }

  isRequired(path: string): boolean {
    return ConfigSchema.isRequired(path);
  }

  getConstraints(path: string): Record<string, unknown> {
    return ConfigSchema.getConstraints(path);
  }

  getStats(): { agents: number; llmProviders: number; conversations: number; version: number } {
    return {
      agents: this.config.agents?.length ?? 0,
      llmProviders: this.config.llmConfigs?.length ?? 0,
      conversations: this.config.conversations?.length ?? 0,
      version: 1,
    };
  }

  private recordChange(path: string, previous: unknown, next: unknown): void {
    this.history.unshift({ path, previous: clone(previous), next: clone(next), timestamp: Date.now() });
    if (this.history.length > this.historyLimit) {
      this.history.pop();
    }
  }

	private assertValid(result: ValidationResult, action: string): void {
		if (result.valid) {
			return;
		}
		const details = result.errors.map(error => `${error.path}: ${error.message}`).join('; ');
		throw new Error(`Validation failed while attempting to ${action}${details ? `: ${details}` : ''}`);
	}

  private getDefaultConfig(): PluginSettings {
    return clone(DEFAULT_SETTINGS);
  }
}
