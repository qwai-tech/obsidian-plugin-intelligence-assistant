import type { App } from 'obsidian';
import type { SecretVault } from '@/features/settings';

export class ObsidianSecretVault implements SecretVault {
	constructor(private readonly app: App) {}

	get(id: string): string | null {
		return this.app.secretStorage.getSecret(id);
	}

	set(id: string, value: string): void {
		this.app.secretStorage.setSecret(id, value);
	}

	list(): string[] {
		return this.app.secretStorage.listSecrets();
	}
}
