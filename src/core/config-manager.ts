// Configuration manager as specified in architecture
import { Vault } from 'obsidian';
import type { PluginSettings } from '@/types';
import { DEFAULT_SETTINGS } from '@/types/settings';
import { ConfigSchema, type ValidationResult } from './config-schema';

type ChangeRecord = {
  path: string;
  previous: any;
  next: any;
  timestamp: number;
};

const clone = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

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
  private dirty = false;

  constructor(private vault: Vault, configFileName: string = 'intelligence-assistant.json') {
    this.configPath = `${vault.configDir}/${configFileName}`;
    this.config = this.getDefaultConfig();
  }

  async load(): Promise<void> {
    try {
      const content = await this.vault.adapter.read(this.configPath);
      this.config = JSON.parse(content);
      ConfigSchema.validate(this.config);
      this.dirty = false;
    } catch {
      // Use default config if file doesn't exist
      this.config = this.getDefaultConfig();
      this.dirty = true;
      await this.save();
    }
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    const content = JSON.stringify(this.config, null, 2);
    await this.vault.adapter.write(this.configPath, content);
    this.dirty = false;
  }

  get<K extends keyof PluginSettings>(key: K): PluginSettings[K] {
    return clone(this.config[key]);
  }

  async set<K extends keyof PluginSettings>(key: K, value: PluginSettings[K], validate = true): Promise<void> {
    const previous = clone(this.config[key]);
    this.config[key] = clone(value);

    if (validate) {
      ConfigSchema.validateSection(key, this.config[key]);
    }

    this.recordChange(String(key), previous, this.config[key]);
    this.dirty = true;
    await this.save();
  }

  getPath<T = unknown>(path: string): T {
    const value = normalizePath(path).reduce((acc: any, segment) => (acc ? acc[segment] : undefined), this.config);
    return clone(value);
  }

  async setPath(path: string, value: unknown, validate = true): Promise<void> {
    const segments = normalizePath(path);
    const last = segments.pop();
    if (!last) return;

    let target: any = this.config;
    for (const segment of segments) {
      if (!(segment in target)) {
        target[segment] = {};
      }
      target = target[segment];
    }

    const previous = clone(target[last]);
    target[last] = clone(value);

    if (validate) {
      ConfigSchema.validate(this.config);
    }

    this.recordChange(path, previous, value);
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

  getConstraints(path: string): Record<string, any> {
    return ConfigSchema.getConstraints(path);
  }

  private recordChange(path: string, previous: unknown, next: unknown): void {
    this.history.unshift({ path, previous: clone(previous), next: clone(next), timestamp: Date.now() });
    if (this.history.length > this.historyLimit) {
      this.history.pop();
    }
  }

  private getDefaultConfig(): PluginSettings {
    return clone(DEFAULT_SETTINGS);
  }
}
