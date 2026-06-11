import { App, Modal, Notice, Setting } from 'obsidian';
import type { MCPServerConfig } from '@/types';
import { applyConfigFieldMetadata } from '@/presentation/utils/config-field-metadata';
import { t } from '@/i18n';
import { TestIds } from '@/presentation/utils/test-ids';

export class MCPServerModal extends Modal {
	private draft: MCPServerConfig;
	private readonly mode: 'create' | 'edit';
	private readonly onSaveCallback: (config: MCPServerConfig) => void | Promise<void>;
	private argsText: string;
	private envText: string;
	private envInputEl: HTMLTextAreaElement | null = null;

	constructor(app: App, initial: MCPServerConfig, mode: 'create' | 'edit', onSave: (config: MCPServerConfig) => void | Promise<void>) {
		super(app);
		const clone = JSON.parse(JSON.stringify(initial)) as MCPServerConfig;
		this.draft = {
			...clone,
			name: clone.name ?? '',
			command: clone.command ?? '',
			args: Array.isArray(clone.args) ? [...clone.args] : [],
			env: clone.env ? { ...clone.env } : {},
			enabled: clone.enabled ?? true,
			connectionMode: clone.connectionMode ?? 'auto',
			cachedTools: clone.cachedTools ? clone.cachedTools.map(tool => ({ ...tool })) : [],
			cacheTimestamp: clone.cacheTimestamp
		};
		this.mode = mode;
		this.onSaveCallback = onSave;
		this.argsText = (this.draft.args ?? []).join(', ');
		this.envText = this.serializeEnv(this.draft.env);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: this.mode === 'edit' ? t('modals.mcpServer.titleEdit') : t('modals.mcpServer.titleAdd') });

		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'mcpServers[].name',
			label: t('modals.mcpServer.serverName.name'),
			description: t('modals.mcpServer.serverName.desc')
		}).addText(text => {
				text.inputEl.setAttribute('data-testid', TestIds.settings.mcpModalNameInput);
				text.setPlaceholder('Acme MCP server');
				text.setValue(this.draft.name ?? '');
				text.onChange(value => {
					this.draft.name = value;
				});
			});

		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'mcpServers[].connectionMode',
			label: t('modals.mcpServer.connectionMode.name'),
			description: t('modals.mcpServer.connectionMode.desc')
		}).addDropdown(dropdown => dropdown
				.addOption('Auto', t('modals.mcpServer.connectionMode.auto'))
				.addOption('Manual', t('modals.mcpServer.connectionMode.manual'))
				.setValue(this.draft.connectionMode ?? 'auto')
				.onChange(value => {
					this.draft.connectionMode = value as 'auto' | 'manual';
				}));

		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'mcpServers[].command',
			label: t('modals.mcpServer.command.name'),
			description: t('modals.mcpServer.command.desc')
		}).addText(text => {
				text.inputEl.setAttribute('data-testid', TestIds.settings.mcpModalCommandInput);
				// eslint-disable-next-line obsidianmd/ui/sentence-case -- placeholder/example string, not UI prose
				text.setPlaceholder('npx @acme/mcp-server');
				text.setValue(this.draft.command ?? '');
				text.onChange(value => {
					this.draft.command = value;
				});
			});

		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'mcpServers[].args',
			label: t('modals.mcpServer.arguments.name'),
			description: t('modals.mcpServer.arguments.desc')
		}).addText(text => {
				text.inputEl.setAttribute('data-testid', TestIds.settings.mcpModalArgsInput);
				text.setPlaceholder('--port=3000, --config=server.json');
				text.setValue(this.argsText);
				text.onChange(value => {
					this.argsText = value;
					this.draft.args = this.normalizeArgs(value);
				});
			});

		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'mcpServers[].env',
			label: t('modals.mcpServer.envVars.name'),
			description: t('modals.mcpServer.envVars.desc')
		}).addTextArea(text => {
				text.setPlaceholder('Api_key=xyz' + '\n' + 'node_env=production');
				text.setValue(this.envText);
				text.inputEl.rows = 4;
				text.onChange(value => {
					this.envText = value;
					if (this.envInputEl) {
						this.envInputEl.removeClass('ia-input-error');
					}
				});
				this.envInputEl = text.inputEl;
			});

		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'mcpServers[].enabled',
			label: t('modals.mcpServer.enabled.name'),
			description: t('modals.mcpServer.enabled.desc')
		}).addToggle(toggle => toggle
				.setValue(this.draft.enabled ?? true)
				.onChange(value => {
					this.draft.enabled = value;
				})
			);

		const buttonBar = contentEl.createDiv('ia-modal-footer');
		buttonBar.removeClass('ia-hidden');

		const cancelBtn = buttonBar.createEl('button', { text: t('modals.mcpServer.cancel') });
		cancelBtn.addClass('ia-modal-btn');
		cancelBtn.addEventListener('click', () => this.close());

		const saveBtn = buttonBar.createEl('button', { text: this.mode === 'edit' ? t('modals.mcpServer.saveEdit') : t('modals.mcpServer.saveAdd') });
		saveBtn.addClass('ia-modal-btn--primary');
		saveBtn.setAttribute('data-testid', TestIds.settings.mcpModalSaveBtn);
		saveBtn.addEventListener('click', () => {
			void (async () => {
				const name = (this.draft.name ?? '').trim();
				if (!name) {
					new Notice(t('modals.mcpServer.validation.nameRequired'));
					return;
				}

				const command = (this.draft.command ?? '').trim();
				if (!command) {
					new Notice(t('modals.mcpServer.validation.commandRequired'));
					return;
				}

				this.draft.args = this.normalizeArgs(this.argsText);

				let parsedEnv: Record<string, string> | undefined;
				try {
					parsedEnv = this.parseEnv(this.envText);
					if (this.envInputEl) {
						this.envInputEl.removeClass('ia-input-error');
					}
				} catch (error) {
					if (this.envInputEl) {
						this.envInputEl.addClass('ia-input-error');
					}
					const message = error instanceof Error ? error.message : 'Invalid environment variable entry';
					new Notice(message);
					return;
				}

				const payload: MCPServerConfig = {
					name,
					command,
					args: this.draft.args ?? [],
					env: parsedEnv ?? {},
					enabled: this.draft.enabled ?? true,
					connectionMode: this.draft.connectionMode ?? 'auto',
					cachedTools: this.draft.cachedTools ?? [],
					cacheTimestamp: this.draft.cacheTimestamp
				};

				await this.onSaveCallback(JSON.parse(JSON.stringify(payload)) as MCPServerConfig);
				this.close();
			})();
		});
	}

	private normalizeArgs(value: string): string[] {
		if (!value) {
			return [];
		}
		return value
			.split(/[\n,]/)
			.map(part => part.trim())
			.filter(part => part.length > 0);
	}

	private serializeEnv(env: Record<string, string> | undefined): string {
		if (!env) {
			return '';
		}
		return Object.entries(env)
			.map(([key, value]) => `${key}=${value}`)
			.join('\n');
	}

	private parseEnv(raw: string): Record<string, string> | undefined {
		const trimmed = raw.trim();
		if (!trimmed) {
			return undefined;
		}

		const env: Record<string, string> = {};
		for (const line of raw.split('\n')) {
			const text = line.trim();
			if (!text) {
				continue;
			}
			const idx = text.indexOf('=');
			if (idx <= 0) {
				throw new Error(`Invalid entry "${text}". Use KEY=VALUE format.`);
			}
			const key = text.slice(0, idx).trim();
			const value = text.slice(idx + 1).trim();
			if (!key) {
				throw new Error(`Missing key for entry "${text}".`);
			}
			env[key] = value;
		}

		return env;
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
