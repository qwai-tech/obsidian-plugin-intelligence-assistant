/**
 * CLI Provider Edit Modal
 * Configuration modal for SDK-based CLI provider connections
 */

import { App, Modal, Setting, FileSystemAdapter } from 'obsidian';
import { join } from 'path';
import type IntelligenceAssistantPlugin from '@plugin';
import type { CLIProviderConfig, CLIAgentProvider } from '@/types';
import { CLI_PROVIDER_LABELS } from '@/types/core/cli-agent';
import { isSdkInstalled } from '@/infrastructure/cli-agent/sdk-installer';
import { SDKInstallModal } from './sdk-install-modal';

export class CLIProviderEditModal extends Modal {
	private draft: CLIProviderConfig;
	private readonly onSaveCallback: (config: CLIProviderConfig) => void | Promise<void>;
	private providerSpecificContainer: HTMLElement | null = null;
	private plugin: IntelligenceAssistantPlugin;

	constructor(app: App, plugin: IntelligenceAssistantPlugin, initial: CLIProviderConfig, onSave: (config: CLIProviderConfig) => void | Promise<void>) {
		super(app);
		this.plugin = plugin;
		this.draft = JSON.parse(JSON.stringify(initial)) as CLIProviderConfig;
		this.onSaveCallback = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'CLI Provider settings' });

		new Setting(contentEl)
			.setName('Provider')
			.setDesc('Select the CLI agent SDK')
			.addDropdown(dropdown => dropdown
				.addOption('claude-code', CLI_PROVIDER_LABELS['claude-code'])
				.addOption('codex', CLI_PROVIDER_LABELS['codex'])
				.addOption('qwen-code', CLI_PROVIDER_LABELS['qwen-code'])
				.setValue(this.draft.provider)
				.onChange(value => {
					this.draft.provider = value as CLIAgentProvider;
					this.renderProviderSpecific();
				}));

		// Provider-specific settings container
		this.providerSpecificContainer = contentEl.createDiv();
		this.renderProviderSpecific();

		// Button bar
		const buttonBar = contentEl.createDiv();
		buttonBar.setCssProps({ 'display': 'flex' });
		buttonBar.setCssProps({ 'justify-content': 'flex-end' });
		buttonBar.setCssProps({ 'gap': '8px' });
		buttonBar.setCssProps({ 'margin-top': '16px' });

		const cancelBtn = buttonBar.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		const saveBtn = buttonBar.createEl('button', { text: 'Save' });
		saveBtn.setCssProps({ 'background': 'var(--interactive-accent)' });
		saveBtn.setCssProps({ 'color': 'white' });
		saveBtn.setCssProps({ 'border': 'none' });
		saveBtn.setCssProps({ 'border-radius': '4px' });
		saveBtn.setCssProps({ 'padding': '6px 16px' });
		saveBtn.addEventListener('click', () => {
			this.draft.updatedAt = Date.now();
			const saved = JSON.parse(JSON.stringify(this.draft)) as CLIProviderConfig;
			void Promise.resolve(this.onSaveCallback(saved));
			this.close();
			// Prompt SDK install if not yet installed
			this.promptSdkInstallIfNeeded(saved.provider);
		});
	}

	private renderProviderSpecific() {
		if (!this.providerSpecificContainer) return;
		this.providerSpecificContainer.empty();

		const container = this.providerSpecificContainer;

		// API Key — common for all providers (optional if CLI login is used)
		if (this.draft.provider === 'claude-code' || this.draft.provider === 'codex') {
			new Setting(container)
				.setName('API key (optional)')
				.setDesc(this.draft.provider === 'claude-code'
					? 'Optional if logged in via "claude login". Or set ANTHROPIC_API_KEY env var.'
					: 'Optional if logged in via "codex login". Or set OPENAI_API_KEY env var.')
				.addText(text => {
					text.setPlaceholder('sk-...');
					text.inputEl.type = 'password';
					text.setValue(this.draft.apiKey || '');
					text.onChange(value => { this.draft.apiKey = value.trim() || undefined; });
				});
		}

		// Claude Code specific
		if (this.draft.provider === 'claude-code') {
			new Setting(container)
				.setName('Max budget (USD)')
				.setDesc('Maximum budget in USD for a single execution (0 = unlimited)')
				.addText(text => text
					.setPlaceholder('0')
					.setValue(this.draft.maxBudgetUsd?.toString() || '')
					.onChange(value => {
						const num = parseFloat(value);
						this.draft.maxBudgetUsd = isNaN(num) || num <= 0 ? undefined : num;
					}));

			new Setting(container)
				.setName('Fallback model')
				.setDesc('Model to use if the primary model fails')
				.addText(text => text
					.setPlaceholder('e.g. haiku')
					.setValue(this.draft.fallbackModel || '')
					.onChange(value => { this.draft.fallbackModel = value.trim() || undefined; }));

			new Setting(container)
				.setName('Enable file checkpointing')
				.setDesc('Track file changes for rewind capability')
				.addToggle(toggle => toggle
					.setValue(this.draft.enableFileCheckpointing ?? false)
					.onChange(value => { this.draft.enableFileCheckpointing = value || undefined; }));

			new Setting(container)
				.setName('MCP servers')
				.setDesc('MCP server configurations (JSON object)')
				.addTextArea(text => {
					text.setPlaceholder('{"server-name": {"command": "npx", "args": [...]}}');
					text.setValue(this.draft.mcpServers ? JSON.stringify(this.draft.mcpServers, null, 2) : '');
					text.inputEl.rows = 4;
					text.onChange(value => {
						try {
							this.draft.mcpServers = value.trim() ? JSON.parse(value.trim()) as Record<string, unknown> : undefined;
						} catch { /* ignore invalid JSON while typing */ }
					});
				});
		}

		// Codex specific
		if (this.draft.provider === 'codex') {
			new Setting(container)
				.setName('Base URL')
				.setDesc('Custom API base URL (leave empty for default)')
				.addText(text => text
					.setPlaceholder('https://api.openai.com')
					.setValue(this.draft.baseUrl || '')
					.onChange(value => { this.draft.baseUrl = value.trim() || undefined; }));

			new Setting(container)
				.setName('Sandbox mode')
				.setDesc('Controls file system access restrictions')
				.addDropdown(dropdown => dropdown
					.addOption('', 'Default')
					.addOption('read-only', 'Read-only')
					.addOption('workspace-write', 'Workspace write')
					.addOption('danger-full-access', 'Full access (dangerous)')
					.setValue(this.draft.sandboxMode || '')
					.onChange(value => {
						this.draft.sandboxMode = (value || undefined) as CLIProviderConfig['sandboxMode'];
					}));

			new Setting(container)
				.setName('Network access')
				.setDesc('Allow the agent to make network requests')
				.addToggle(toggle => toggle
					.setValue(this.draft.networkAccessEnabled ?? false)
					.onChange(value => { this.draft.networkAccessEnabled = value || undefined; }));

			new Setting(container)
				.setName('Web search mode')
				.setDesc('Controls web search behavior')
				.addDropdown(dropdown => dropdown
					.addOption('', 'Default')
					.addOption('disabled', 'Disabled')
					.addOption('cached', 'Cached')
					.addOption('live', 'Live')
					.setValue(this.draft.webSearchMode || '')
					.onChange(value => {
						this.draft.webSearchMode = (value || undefined) as CLIProviderConfig['webSearchMode'];
					}));

			new Setting(container)
				.setName('Skip git repo check')
				.setDesc('Allow running outside a git repository')
				.addToggle(toggle => toggle
					.setValue(this.draft.skipGitRepoCheck ?? false)
					.onChange(value => { this.draft.skipGitRepoCheck = value || undefined; }));
		}

		// Qwen Code specific
		if (this.draft.provider === 'qwen-code') {
			new Setting(container)
				.setName('Auth type')
				.setDesc('Authentication method for Qwen Code')
				.addDropdown(dropdown => dropdown
					.addOption('openai', 'OpenAI-compatible')
					.addOption('qwen-oauth', 'Qwen OAuth')
					.setValue(this.draft.authType || 'openai')
					.onChange(value => { this.draft.authType = value as 'openai' | 'qwen-oauth'; }));

			new Setting(container)
				.setName('API key (optional)')
				.setDesc('Optional if using Qwen OAuth login. Or set DASHSCOPE_API_KEY env var.')
				.addText(text => {
					text.setPlaceholder('sk-...');
					text.inputEl.type = 'password';
					text.setValue(this.draft.apiKey || '');
					text.onChange(value => { this.draft.apiKey = value.trim() || undefined; });
				});

			new Setting(container)
				.setName('Debug mode')
				.setDesc('Enable verbose debug logging from the CLI')
				.addToggle(toggle => toggle
					.setValue(this.draft.debug ?? false)
					.onChange(value => { this.draft.debug = value || undefined; }));

			new Setting(container)
				.setName('MCP servers')
				.setDesc('MCP server configurations (JSON object)')
				.addTextArea(text => {
					text.setPlaceholder('{"server-name": {"command": "npx", "args": [...]}}');
					text.setValue(this.draft.mcpServers ? JSON.stringify(this.draft.mcpServers, null, 2) : '');
					text.inputEl.rows = 4;
					text.onChange(value => {
						try {
							this.draft.mcpServers = value.trim() ? JSON.parse(value.trim()) as Record<string, unknown> : undefined;
						} catch { /* ignore invalid JSON while typing */ }
					});
				});
		}
	}

	private promptSdkInstallIfNeeded(provider: CLIAgentProvider): void {
		const basePath = this.app.vault.adapter instanceof FileSystemAdapter
			? this.app.vault.adapter.getBasePath()
			: '';
		if (!basePath) return;
		const pluginDir = join(basePath, this.app.vault.configDir, 'plugins', this.plugin.manifest.id);
		if (!isSdkInstalled(pluginDir, provider)) {
			const modal = new SDKInstallModal(this.app, provider, pluginDir);
			void modal.waitForResult();
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
