/**
 * CLI Agent Edit Modal
 * Configuration modal for SDK-based CLI agents (references a CLI Provider)
 */

import { App, Modal, Setting } from 'obsidian';
import type { CLIAgentConfig, CLIAgentPermissionMode, CLIProviderConfig } from '@/types';
import { CLI_PROVIDER_LABELS } from '@/types/core/cli-agent';

export class CLIAgentEditModal extends Modal {
	private draft: CLIAgentConfig;
	private readonly providers: CLIProviderConfig[];
	private readonly onSaveCallback: (config: CLIAgentConfig) => void | Promise<void>;
	private overridesContainer: HTMLElement | null = null;

	constructor(
		app: App,
		initial: CLIAgentConfig,
		providers: CLIProviderConfig[],
		onSave: (config: CLIAgentConfig) => void | Promise<void>
	) {
		super(app);
		this.draft = JSON.parse(JSON.stringify(initial)) as CLIAgentConfig;
		this.providers = providers;
		this.onSaveCallback = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'CLI Agent settings' });

		// Basic settings
		new Setting(contentEl)
			.setName('Name')
			.setDesc('Display name for this CLI agent')
			.addText(text => text
				.setPlaceholder('My CLI Agent')
				.setValue(this.draft.name)
				.onChange(value => { this.draft.name = value; }));

		new Setting(contentEl)
			.setName('Description')
			.setDesc('Brief description of what this agent does')
			.addText(text => text
				.setPlaceholder('A helpful coding assistant')
				.setValue(this.draft.description)
				.onChange(value => { this.draft.description = value; }));

		// Provider selector
		new Setting(contentEl)
			.setName('Provider')
			.setDesc('Select the CLI provider connection to use')
			.addDropdown(dropdown => {
				for (const p of this.providers) {
					const label = CLI_PROVIDER_LABELS[p.provider] || p.provider;
					dropdown.addOption(p.id, `${label} (${p.id})`);
				}
				dropdown.setValue(this.draft.providerId);
				dropdown.onChange(value => {
					this.draft.providerId = value;
					this.renderOverrides();
				});
			});

		new Setting(contentEl)
			.setName('Model')
			.setDesc('Model to use (leave empty for default)')
			.addText(text => text
				.setPlaceholder('e.g. sonnet, gpt-4o, qwen-max')
				.setValue(this.draft.model || '')
				.onChange(value => { this.draft.model = value.trim() || undefined; }));

		new Setting(contentEl)
			.setName('Permission mode')
			.setDesc('Controls how the agent handles tool execution approvals')
			.addDropdown(dropdown => dropdown
				.addOption('default', 'Default (require approval)')
				.addOption('plan', 'Plan (read-only, present strategy)')
				.addOption('auto-edit', 'Auto-edit (auto-approve edits)')
				.addOption('bypass', 'Bypass (no approval needed)')
				.setValue(this.draft.permissionMode)
				.onChange(value => { this.draft.permissionMode = value as CLIAgentPermissionMode; }));

		new Setting(contentEl)
			.setName('System prompt')
			.setDesc('Custom system prompt for the agent')
			.addTextArea(text => {
				text.setPlaceholder('Optional system prompt...');
				text.setValue(this.draft.systemPrompt || '');
				text.inputEl.rows = 4;
				text.onChange(value => { this.draft.systemPrompt = value.trim() || undefined; });
			});

		new Setting(contentEl)
			.setName('Max turns')
			.setDesc('Maximum conversation turns before stopping (0 = unlimited)')
			.addText(text => text
				.setPlaceholder('0')
				.setValue(this.draft.maxTurns?.toString() || '')
				.onChange(value => {
					const num = parseInt(value, 10);
					this.draft.maxTurns = isNaN(num) || num <= 0 ? undefined : num;
				}));

		new Setting(contentEl)
			.setName('Working directory')
			.setDesc('Custom working directory (leave empty for vault root)')
			.addText(text => text
				.setPlaceholder('/path/to/project')
				.setValue(this.draft.cwd || '')
				.onChange(value => { this.draft.cwd = value.trim() || undefined; }));

		new Setting(contentEl)
			.setName('Allowed tools')
			.setDesc('Comma-separated list of tool names to allow (leave empty for all)')
			.addText(text => text
				.setPlaceholder('Read, Write, Bash')
				.setValue((this.draft.allowedTools ?? []).join(', '))
				.onChange(value => {
					const tools = value.split(',').map(s => s.trim()).filter(Boolean);
					this.draft.allowedTools = tools.length > 0 ? tools : undefined;
				}));

		new Setting(contentEl)
			.setName('Disallowed tools')
			.setDesc('Comma-separated list of tool names to disallow')
			.addText(text => text
				.setPlaceholder('Bash, Write')
				.setValue((this.draft.disallowedTools ?? []).join(', '))
				.onChange(value => {
					const tools = value.split(',').map(s => s.trim()).filter(Boolean);
					this.draft.disallowedTools = tools.length > 0 ? tools : undefined;
				}));

		// Provider-type-specific agent overrides
		this.overridesContainer = contentEl.createDiv();
		this.renderOverrides();

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
			void Promise.resolve(this.onSaveCallback(JSON.parse(JSON.stringify(this.draft)) as CLIAgentConfig));
			this.close();
		});
	}

	private getSelectedProviderType(): string {
		const provider = this.providers.find(p => p.id === this.draft.providerId);
		return provider?.provider ?? 'claude-code';
	}

	private renderOverrides() {
		if (!this.overridesContainer) return;
		this.overridesContainer.empty();

		const providerType = this.getSelectedProviderType();
		const container = this.overridesContainer;
		container.createEl('h4', { text: 'Agent-specific overrides' });

		// Claude Code overrides
		if (providerType === 'claude-code') {
			new Setting(container)
				.setName('Max thinking tokens')
				.setDesc('Maximum tokens for the thinking/reasoning process')
				.addText(text => text
					.setPlaceholder('Default')
					.setValue(this.draft.maxThinkingTokens?.toString() || '')
					.onChange(value => {
						const num = parseInt(value, 10);
						this.draft.maxThinkingTokens = isNaN(num) || num <= 0 ? undefined : num;
					}));

			new Setting(container)
				.setName('Additional directories')
				.setDesc('Extra directories the agent can access (comma-separated paths)')
				.addText(text => text
					.setPlaceholder('/path/one, /path/two')
					.setValue((this.draft.additionalDirectories ?? []).join(', '))
					.onChange(value => {
						const dirs = value.split(',').map(s => s.trim()).filter(Boolean);
						this.draft.additionalDirectories = dirs.length > 0 ? dirs : undefined;
					}));
		}

		// Codex overrides
		if (providerType === 'codex') {
			new Setting(container)
				.setName('Reasoning effort')
				.setDesc('Controls how much reasoning the model performs')
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
				.setDesc('Extra directories the agent can access (comma-separated paths)')
				.addText(text => text
					.setPlaceholder('/path/one, /path/two')
					.setValue((this.draft.additionalDirectories ?? []).join(', '))
					.onChange(value => {
						const dirs = value.split(',').map(s => s.trim()).filter(Boolean);
						this.draft.additionalDirectories = dirs.length > 0 ? dirs : undefined;
					}));
		}

		// Qwen Code overrides
		if (providerType === 'qwen-code') {
			new Setting(container)
				.setName('Max session turns')
				.setDesc('Maximum turns per session (-1 = unlimited)')
				.addText(text => text
					.setPlaceholder('-1')
					.setValue(this.draft.maxSessionTurns?.toString() || '')
					.onChange(value => {
						const num = parseInt(value, 10);
						this.draft.maxSessionTurns = isNaN(num) ? undefined : num;
					}));
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
