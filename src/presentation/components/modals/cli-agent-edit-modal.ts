/**
 * CLI Agent Edit Modal
 * Unified configuration modal for SDK-based CLI agents with progressive disclosure
 */

import { App, Modal, Setting } from 'obsidian';
import type { CLIAgentConfig, CLIAgentPermissionMode, CLIAgentProvider } from '@/types';
import { CLI_PROVIDER_LABELS } from '@/types/core/cli-agent';
import { getSdkStatus } from '@/infrastructure/cli-agent/sdk-installer';
import { SDKInstallModal } from './sdk-install-modal';

const DEFAULT_MODELS: Record<CLIAgentProvider, string> = {
	'claude-code': 'sonnet',
	'codex': 'gpt-4.1',
	'qwen-code': 'qwen3-coder-plus'
};

export class CLIAgentEditModal extends Modal {
	private draft: CLIAgentConfig;
	private readonly onSaveCallback: (config: CLIAgentConfig) => void | Promise<void>;
	private readonly pluginDir: string;
	private advancedContainer: HTMLElement | null = null;
	private authContainer: HTMLElement | null = null;

	constructor(
		app: App,
		initial: CLIAgentConfig,
		pluginDir: string,
		onSave: (config: CLIAgentConfig) => void | Promise<void>
	) {
		super(app);
		this.draft = JSON.parse(JSON.stringify(initial)) as CLIAgentConfig;
		this.pluginDir = pluginDir;
		this.onSaveCallback = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'CLI agent' });

		// --- Basic Settings ---
		new Setting(contentEl)
			.setName('Provider')
			.setDesc('CLI agent SDK to use')
			.addDropdown(dropdown => {
				for (const [key, label] of Object.entries(CLI_PROVIDER_LABELS)) {
					dropdown.addOption(key, label);
				}
				dropdown.setValue(this.draft.provider);
				dropdown.onChange(value => {
					this.draft.provider = value as CLIAgentProvider;
					// Auto-fill model default when switching provider
					if (!this.draft.model) {
						this.draft.model = DEFAULT_MODELS[this.draft.provider];
					}
					this.renderAuth();
					this.renderAdvanced();
				});
			});

		new Setting(contentEl)
			.setName('Name')
			.setDesc('Display name for this agent')
			.addText(text => text
				.setPlaceholder('My CLI agent')
				.setValue(this.draft.name)
				.onChange(value => { this.draft.name = value; }));

		new Setting(contentEl)
			.setName('Model')
			.setDesc('Model to use (leave empty for provider default)')
			.addText(text => text
				.setPlaceholder(DEFAULT_MODELS[this.draft.provider] ?? 'default')
				.setValue(this.draft.model || '')
				.onChange(value => { this.draft.model = value.trim() || undefined; }));

		new Setting(contentEl)
			.setName('Permission mode')
			.setDesc('Controls tool execution approval behavior')
			.addDropdown(dropdown => dropdown
				.addOption('default', 'Default (require approval)')
				.addOption('plan', 'Plan (read-only)')
				.addOption('auto-edit', 'Auto-edit (auto-approve edits)')
				.addOption('bypass', 'Bypass (no approval needed)')
				.setValue(this.draft.permissionMode)
				.onChange(value => { this.draft.permissionMode = value as CLIAgentPermissionMode; }));

		// --- System Prompt (collapsible) ---
		this.renderCollapsibleSection(contentEl, 'System prompt', container => {
			new Setting(container)
				.setName('Custom system prompt')
				.setDesc('Override the default system prompt')
				.addTextArea(text => {
					text.setPlaceholder('Optional system prompt...');
					text.setValue(this.draft.systemPrompt || '');
					text.inputEl.rows = 4;
					text.onChange(value => { this.draft.systemPrompt = value.trim() || undefined; });
				});
		});

		// --- Authentication (collapsible) ---
		this.authContainer = contentEl.createDiv();
		this.renderAuth();

		// --- Advanced (collapsible) ---
		this.advancedContainer = contentEl.createDiv();
		this.renderAdvanced();

		// --- Button Bar ---
		const buttonBar = contentEl.createDiv();
		buttonBar.setCssProps({ 'display': 'flex', 'justify-content': 'flex-end', 'gap': '8px', 'margin-top': '16px' });

		const cancelBtn = buttonBar.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		const saveBtn = buttonBar.createEl('button', { text: 'Save', cls: 'mod-cta' });
		saveBtn.addEventListener('click', () => {
			this.draft.updatedAt = Date.now();
			void Promise.resolve(this.onSaveCallback(JSON.parse(JSON.stringify(this.draft)) as CLIAgentConfig));
			this.close();
			this.promptSdkInstallIfNeeded();
		});
	}

	private renderAuth() {
		if (!this.authContainer) return;
		this.authContainer.empty();

		this.renderCollapsibleSection(this.authContainer, 'Authentication', container => {
			container.createEl('p', {
				text: 'Optional. Leave empty to use the CLI\'s own authentication (env vars, OAuth, or CLI login).',
				cls: 'setting-item-description'
			});

			new Setting(container)
				.setName('API key')
				.setDesc('Override the default API key')
				.addText(text => {
					text.inputEl.type = 'password';
					text.setPlaceholder('Leave empty to use default');
					text.setValue(this.draft.apiKey || '');
					text.onChange(value => { this.draft.apiKey = value.trim() || undefined; });
				});

			if (this.draft.provider === 'codex') {
				new Setting(container)
					.setName('Base URL')
					.setDesc('Custom OpenAI-compatible API endpoint')
					.addText(text => text
						.setPlaceholder('https://api.openai.com')
						.setValue(this.draft.baseUrl || '')
						.onChange(value => { this.draft.baseUrl = value.trim() || undefined; }));
			}

			if (this.draft.provider === 'qwen-code') {
				new Setting(container)
					.setName('Auth type')
					.addDropdown(dropdown => dropdown
						.addOption('openai', 'API key (OpenAI-compatible)')
						.addOption('qwen-oauth', 'Qwen OAuth (free tier)')
						.setValue(this.draft.authType || 'openai')
						.onChange(value => { this.draft.authType = value as 'openai' | 'qwen-oauth'; }));
			}
		});
	}

	private renderAdvanced() {
		if (!this.advancedContainer) return;
		this.advancedContainer.empty();

		this.renderCollapsibleSection(this.advancedContainer, 'Advanced', container => {
			// Common settings
			new Setting(container)
				.setName('Max turns')
				.setDesc('Maximum conversation turns (0 = unlimited)')
				.addText(text => text
					.setPlaceholder('0')
					.setValue(this.draft.maxTurns?.toString() || '')
					.onChange(value => {
						const num = parseInt(value, 10);
						this.draft.maxTurns = isNaN(num) || num <= 0 ? undefined : num;
					}));

			new Setting(container)
				.setName('Working directory')
				.setDesc('Custom working directory (leave empty for vault root)')
				.addText(text => text
					.setPlaceholder('/path/to/project')
					.setValue(this.draft.cwd || '')
					.onChange(value => { this.draft.cwd = value.trim() || undefined; }));

			new Setting(container)
				.setName('Allowed tools')
				.setDesc('Comma-separated list of tools to allow (empty = all)')
				.addText(text => text
					.setPlaceholder('Read, Write, Bash')
					.setValue((this.draft.allowedTools ?? []).join(', '))
					.onChange(value => {
						const tools = value.split(',').map(s => s.trim()).filter(Boolean);
						this.draft.allowedTools = tools.length > 0 ? tools : undefined;
					}));

			new Setting(container)
				.setName('Disallowed tools')
				.setDesc('Comma-separated list of tools to disallow')
				.addText(text => text
					.setPlaceholder('Bash, Write')
					.setValue((this.draft.disallowedTools ?? []).join(', '))
					.onChange(value => {
						const tools = value.split(',').map(s => s.trim()).filter(Boolean);
						this.draft.disallowedTools = tools.length > 0 ? tools : undefined;
					}));

			// Provider-specific advanced settings
			this.renderProviderAdvanced(container);
		});
	}

	private renderProviderAdvanced(container: HTMLElement) {
		const provider = this.draft.provider;

		if (provider === 'claude-code') {
			container.createEl('h5', { text: 'Claude Code options' });

			new Setting(container)
				.setName('Max budget (USD)')
				.setDesc('Budget cap per execution (0 = unlimited)')
				.addText(text => text
					.setPlaceholder('0')
					.setValue(this.draft.maxBudgetUsd?.toString() || '')
					.onChange(value => {
						const num = parseFloat(value);
						this.draft.maxBudgetUsd = isNaN(num) || num <= 0 ? undefined : num;
					}));

			new Setting(container)
				.setName('Fallback model')
				.setDesc('Model to fall back to if primary is unavailable')
				.addText(text => text
					.setPlaceholder('haiku')
					.setValue(this.draft.fallbackModel || '')
					.onChange(value => { this.draft.fallbackModel = value.trim() || undefined; }));

			new Setting(container)
				.setName('File checkpointing')
				.setDesc('Enable file checkpointing for undo support')
				.addToggle(toggle => toggle
					.setValue(this.draft.enableFileCheckpointing ?? false)
					.onChange(value => { this.draft.enableFileCheckpointing = value || undefined; }));

			new Setting(container)
				.setName('Max thinking tokens')
				.addText(text => text
					.setPlaceholder('Default')
					.setValue(this.draft.maxThinkingTokens?.toString() || '')
					.onChange(value => {
						const num = parseInt(value, 10);
						this.draft.maxThinkingTokens = isNaN(num) || num <= 0 ? undefined : num;
					}));

			new Setting(container)
				.setName('Additional directories')
				.setDesc('Extra directories the agent can access (comma-separated)')
				.addText(text => text
					.setPlaceholder('/path/one, /path/two')
					.setValue((this.draft.additionalDirectories ?? []).join(', '))
					.onChange(value => {
						const dirs = value.split(',').map(s => s.trim()).filter(Boolean);
						this.draft.additionalDirectories = dirs.length > 0 ? dirs : undefined;
					}));

			new Setting(container)
				.setName('MCP servers')
				.setDesc('JSON object of MCP server configurations')
				.addTextArea(text => {
					text.setPlaceholder('{"server": {"command": "npx", "args": ["..."]}}');
					text.setValue(this.draft.mcpServers ? JSON.stringify(this.draft.mcpServers, null, 2) : '');
					text.inputEl.rows = 3;
					text.onChange(value => {
						try {
							this.draft.mcpServers = value.trim() ? JSON.parse(value) as Record<string, unknown> : undefined;
						} catch { /* keep current value */ }
					});
				});
		}

		if (provider === 'codex') {
			container.createEl('h5', { text: 'Codex options' });

			new Setting(container)
				.setName('Sandbox mode')
				.addDropdown(dropdown => dropdown
					.addOption('', 'Default')
					.addOption('read-only', 'Read-only')
					.addOption('workspace-write', 'Workspace write')
					.addOption('danger-full-access', 'Full access (dangerous)')
					.setValue(this.draft.sandboxMode || '')
					.onChange(value => {
						this.draft.sandboxMode = (value || undefined) as CLIAgentConfig['sandboxMode'];
					}));

			new Setting(container)
				.setName('Network access')
				.addToggle(toggle => toggle
					.setValue(this.draft.networkAccessEnabled ?? false)
					.onChange(value => { this.draft.networkAccessEnabled = value || undefined; }));

			new Setting(container)
				.setName('Web search')
				.addDropdown(dropdown => dropdown
					.addOption('', 'Default')
					.addOption('disabled', 'Disabled')
					.addOption('cached', 'Cached')
					.addOption('live', 'Live')
					.setValue(this.draft.webSearchMode || '')
					.onChange(value => {
						this.draft.webSearchMode = (value || undefined) as CLIAgentConfig['webSearchMode'];
					}));

			new Setting(container)
				.setName('Skip git repo check')
				.addToggle(toggle => toggle
					.setValue(this.draft.skipGitRepoCheck ?? false)
					.onChange(value => { this.draft.skipGitRepoCheck = value || undefined; }));

			new Setting(container)
				.setName('Reasoning effort')
				.addDropdown(dropdown => dropdown
					.addOption('', 'Default')
					.addOption('minimal', 'Minimal')
					.addOption('low', 'Low')
					.addOption('medium', 'Medium')
					.addOption('high', 'High')
					.addOption('xhigh', 'Extra high')
					.setValue(this.draft.modelReasoningEffort || '')
					.onChange(value => {
						this.draft.modelReasoningEffort = (value || undefined) as CLIAgentConfig['modelReasoningEffort'];
					}));

			new Setting(container)
				.setName('Additional directories')
				.setDesc('Extra directories the agent can access (comma-separated)')
				.addText(text => text
					.setPlaceholder('/path/one, /path/two')
					.setValue((this.draft.additionalDirectories ?? []).join(', '))
					.onChange(value => {
						const dirs = value.split(',').map(s => s.trim()).filter(Boolean);
						this.draft.additionalDirectories = dirs.length > 0 ? dirs : undefined;
					}));
		}

		if (provider === 'qwen-code') {
			container.createEl('h5', { text: 'Qwen Code options' });

			new Setting(container)
				.setName('Debug mode')
				.addToggle(toggle => toggle
					.setValue(this.draft.debug ?? false)
					.onChange(value => { this.draft.debug = value || undefined; }));

			new Setting(container)
				.setName('Max session turns')
				.setDesc('-1 = unlimited')
				.addText(text => text
					.setPlaceholder('-1')
					.setValue(this.draft.maxSessionTurns?.toString() || '')
					.onChange(value => {
						const num = parseInt(value, 10);
						this.draft.maxSessionTurns = isNaN(num) ? undefined : num;
					}));

			new Setting(container)
				.setName('MCP servers')
				.setDesc('JSON object of MCP server configurations')
				.addTextArea(text => {
					text.setPlaceholder('{"server": {"command": "npx", "args": ["..."]}}');
					text.setValue(this.draft.mcpServers ? JSON.stringify(this.draft.mcpServers, null, 2) : '');
					text.inputEl.rows = 3;
					text.onChange(value => {
						try {
							this.draft.mcpServers = value.trim() ? JSON.parse(value) as Record<string, unknown> : undefined;
						} catch { /* keep current value */ }
					});
				});
		}
	}

	private renderCollapsibleSection(parent: HTMLElement, title: string, renderContent: (container: HTMLElement) => void) {
		const details = parent.createEl('details');
		details.createEl('summary', { text: title, cls: 'ia-collapsible-summary' });
		const body = details.createDiv();
		body.setCssProps({ 'padding-top': '8px' });
		renderContent(body);
	}

	private promptSdkInstallIfNeeded() {
		if (!this.pluginDir) return;
		const status = getSdkStatus(this.pluginDir, this.draft.provider);
		if (status === 'not-installed' || status === 'outdated') {
			new SDKInstallModal(this.app, this.draft.provider, this.pluginDir).open();
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
