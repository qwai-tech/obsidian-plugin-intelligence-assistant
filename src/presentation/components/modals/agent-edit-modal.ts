import { App, ButtonComponent, Modal, Notice, Setting, ToggleComponent } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import type {Agent, BuiltInToolConfig, MCPServerConfig, CLIToolConfig} from '@/types';
import { t } from '@/i18n';
import { applyConfigFieldMetadata } from '@/presentation/utils/config-field-metadata';

export class AgentEditModal extends Modal {
	private agent: Agent;
	private onSaveCallback: (agent: Agent) => void | Promise<void>;
	private plugin: IntelligenceAssistantPlugin;
	private selectedSystemPromptId: string;
	private customPromptName: string = '';
	private customPromptContent: string = '';
	private customPromptSection: HTMLElement | null = null;
	private modelAliasMap: Map<string, string> = new Map();
	private fixedModelSetting: Setting | null = null;

	constructor(app: App, plugin: IntelligenceAssistantPlugin, agent: Agent, onSave: (agent: Agent) => void | Promise<void>) {
		super(app);
		this.plugin = plugin;
		const clonedAgent = JSON.parse(JSON.stringify(agent)) as unknown as Agent; // Deep copy with explicit typing
		this.agent = clonedAgent;
		this.onSaveCallback = onSave;
		this.selectedSystemPromptId = agent.systemPromptId;
		// toolAccess is the editor's working state. The Agent type requires
		// it, but defend against a malformed agent (e.g. from a partial
		// hand-edit of agents/*.json) by initializing the sources map.
		this.agent.toolAccess ??= { sources: {} };
		this.agent.toolAccess.sources ??= {};
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: t('modals.agentEdit.title') });

		// Icon field
		new Setting(contentEl)
			.setName(t('modals.agentEdit.icon.name'))
			.setDesc(t('modals.agentEdit.icon.desc'))
			.addText(text => text
				.setValue(this.agent.icon)
				.onChange(value => {
					this.agent.icon = value;
				}));

		// Name field
		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'agents[].name',
			label: t('modals.agentEdit.name.label'),
			description: t('modals.agentEdit.name.desc')
		}).addText(text => text
				.setValue(this.agent.name)
				.onChange(value => {
					this.agent.name = value;
				}));

		// Description field
		new Setting(contentEl)
			.setName(t('modals.agentEdit.description.name'))
			.setDesc(t('modals.agentEdit.description.desc'))
			.addTextArea(text => {
				text.setValue(this.agent.description);
				text.inputEl.rows = 3;
				text.onChange(value => {
					this.agent.description = value;
				});
			});

		// Model Strategy Selection
		const modelOptions = this.buildModelOptions();
		const hasCachedModels = modelOptions.length > 0;
		
		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'agents[].modelStrategy.strategy',
			label: t('modals.agentEdit.modelStrategy.name'),
			description: t('modals.agentEdit.modelStrategy.desc')
		}).addDropdown(dropdown => {
				dropdown
					.addOption('default', t('modals.agentEdit.modelStrategy.options.default'))
					.addOption('chat-view', t('modals.agentEdit.modelStrategy.options.chatView'))
					.addOption('fixed', t('modals.agentEdit.modelStrategy.options.fixed'));
				
				// Set the initial value based on the current strategy
				dropdown.setValue(this.agent.modelStrategy.strategy);
				
				dropdown.onChange(value => {
					this.agent.modelStrategy.strategy = value as 'default' | 'chat-view' | 'fixed';
					// When changing strategy to fixed, ensure there's a modelId set if possible
					if (value === 'fixed' && !this.agent.modelStrategy.modelId && hasCachedModels) {
						this.agent.modelStrategy.modelId = modelOptions[0].id;
					}
					this.updateModelControls();
				});
			});

		// Fixed Model Selection (only shown when strategy is 'fixed')
		this.fixedModelSetting = applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'agents[].modelStrategy.modelId',
			label: t('modals.agentEdit.fixedModel.name'),
			description: hasCachedModels
				? t('modals.agentEdit.fixedModel.desc')
				: t('modals.agentEdit.fixedModel.descNoModels')
		})
			.addDropdown(dropdown => {
				if (!hasCachedModels) {
					dropdown.addOption('', t('modals.agentEdit.modelStrategy.noModels'));
					dropdown.selectEl.disabled = true;
					return;
				}

				for (const option of modelOptions) {
				dropdown.addOption(option.id, option.label);
			}
				
				// Set the initial value based on the current modelId
				const initialModelId = this.getInitialModelSelectionForStrategy(modelOptions);
				dropdown.setValue(initialModelId);
				if (!this.agent.modelStrategy.modelId) {
					this.agent.modelStrategy.modelId = initialModelId;
				}
				
				dropdown.onChange(value => {
					this.agent.modelStrategy.modelId = value;
				});
			});
			
		// Initially hide the fixed model setting if not using fixed strategy
		if (this.agent.modelStrategy.strategy !== 'fixed') {
			this.fixedModelSetting.settingEl.hide();
		}

		// Temperature field
		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'agents[].temperature',
			label: t('modals.agentEdit.temperature.label'),
			description: t('modals.agentEdit.temperature.desc')
		}).addSlider(slider => slider
				.setLimits(0, 2, 0.1)
				.setValue(this.agent.temperature)
				.onChange(value => {
					this.agent.temperature = value;
				}));

		// Max Tokens field
		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'agents[].maxTokens',
			label: t('modals.agentEdit.maxTokens.label'),
			description: t('modals.agentEdit.maxTokens.desc')
		}).addText(text => text
				.setValue(String(this.agent.maxTokens))
				.onChange(value => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 0) {
						this.agent.maxTokens = num;
					}
				}));

		// Context Window field
		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'agents[].contextWindow',
			label: t('modals.agentEdit.contextWindow.label'),
			description: t('modals.agentEdit.contextWindow.desc')
		}).addText(text => text
				.setValue(String(this.agent.contextWindow))
				.onChange(value => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 0) {
						this.agent.contextWindow = num;
					}
				}));

		const prompts = this.plugin.settings.systemPrompts;
		const hasPrompt = prompts.some(prompt => prompt.id === this.agent.systemPromptId);
		this.selectedSystemPromptId = hasPrompt ? this.agent.systemPromptId : '__custom__';
		if (this.selectedSystemPromptId === '__custom__') {
			this.ensureCustomPromptDefaults();
		}

		let customNameInput: HTMLInputElement | null = null;
		let customContentInput: HTMLTextAreaElement | null = null;

		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'agents[].systemPromptId',
			label: t('modals.agentEdit.systemPrompt.name'),
			description: t('modals.agentEdit.systemPrompt.desc')
		}).addDropdown(dropdown => {
				prompts.forEach(prompt => {
					dropdown.addOption(prompt.id, prompt.name);
				});
				dropdown.addOption('__custom__', t('modals.agentEdit.systemPrompt.createNew'));
				dropdown.setValue(this.selectedSystemPromptId);
				dropdown.onChange(value => {
					this.selectedSystemPromptId = value;
					if (value === '__custom__') {
						this.ensureCustomPromptDefaults();
						if (customNameInput) {
							customNameInput.value = this.customPromptName;
						}
						if (customContentInput) {
							customContentInput.value = this.customPromptContent;
						}
					}
					this.toggleCustomPromptSection(value === '__custom__');
				});
			});

		this.customPromptSection = contentEl.createDiv('ia-custom-prompt-section');
		this.toggleCustomPromptSection(this.selectedSystemPromptId === '__custom__');

		new Setting(this.customPromptSection)
			.setName(t('modals.agentEdit.systemPrompt.promptName.name'))
			.setDesc(t('modals.agentEdit.systemPrompt.promptName.desc'))
			.addText(text => {
				customNameInput = text.inputEl;
				text.setValue(this.customPromptName);
				text.onChange(value => {
					this.customPromptName = value;
				});
			});

		new Setting(this.customPromptSection)
			.setName(t('modals.agentEdit.systemPrompt.promptContent.name'))
			.setDesc(t('modals.agentEdit.systemPrompt.promptContent.desc'))
			.addTextArea(text => {
				customContentInput = text.inputEl;
				text.setValue(this.customPromptContent);
				text.inputEl.rows = 10;
				text.inputEl.addClass('ia-textarea--code');
				text.onChange(value => {
					this.customPromptContent = value;
				});
			});

		// Capabilities section
		contentEl.createEl('h3', { text: t('modals.agentEdit.capabilities') });

		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'agents[].ragEnabled',
			label: t('modals.agentEdit.rag.name'),
			description: t('modals.agentEdit.rag.desc')
		}).addToggle(toggle => toggle
				.setValue(this.agent.ragEnabled)
				.onChange(value => {
					this.agent.ragEnabled = value;
				}));

		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'agents[].webSearchEnabled',
			label: t('modals.agentEdit.webSearch.name'),
			description: t('modals.agentEdit.webSearch.desc')
		}).addToggle(toggle => toggle
				.setValue(this.agent.webSearchEnabled)
				.onChange(value => {
					this.agent.webSearchEnabled = value;
				}));

		// Memory settings placeholder (temporarily disabled)
		contentEl.createEl('h3', { text: t('modals.agentEdit.memory.title') });
		const memoryNotice = contentEl.createEl('p', {
			text: t('modals.agentEdit.memory.notice')
		});
		memoryNotice.addClass('ia-section-description');

		// Tools section
		contentEl.createEl('h3', { text: t('modals.agentEdit.tools.title') });

		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'agents[].maxSteps',
			label: t('modals.agentEdit.maxSteps.name'),
			description: t('modals.agentEdit.maxSteps.desc')
		}).addSlider(slider => slider
				.setLimits(1, 20, 1)
				.setValue(this.agent.maxSteps)
				.setDynamicTooltip()
				.onChange(value => {
					this.agent.maxSteps = value;
				}));

		// Built-in tools
		new Setting(contentEl)
			.setName(t('modals.agentEdit.tools.builtIn.name'))
			.setDesc(t('modals.agentEdit.tools.builtIn.desc'));

		this.plugin.settings.builtInTools.forEach((tool: BuiltInToolConfig) => {
			const fallbackName = tool.type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
			const toolNameKey = `settings.tools.builtIn.toolNames.${tool.type}`;
			new Setting(contentEl)
				.setName(t(toolNameKey, { defaultValue: fallbackName }))
				.addToggle(toggle => toggle
					.setValue(this.hasBuiltinTool(tool.type))
					.onChange(value => this.setBuiltinTool(tool.type, value)));
		});

		// CLI Tools
		const cliTools = this.plugin.settings.cliTools ?? [];
		const enabledCLITools = cliTools.filter(tool => tool.enabled);
		if (enabledCLITools.length > 0) {
			const cliToolToggles: Array<{ id: string; toggle: ToggleComponent }> = [];

			// Master toggle reflects the aggregate state: ON iff every enabled
			// CLI tool is in this agent's toolAccess. Flipping ON adds them
			// all; flipping OFF removes them all.
			new Setting(contentEl)
				.setName(t('modals.agentEdit.tools.cli.name'))
				.setDesc(t('modals.agentEdit.tools.cli.desc'))
				.addToggle(toggle => {
					toggle.setValue(this.allCliEnabled(enabledCLITools));
					toggle.onChange(value => {
						for (const tool of enabledCLITools) {
							this.setCli(tool.id, value);
						}
						this.refreshCliPerToolToggles(cliToolToggles);
					});
				});

			// Individual tool toggles
			enabledCLITools.forEach((tool: CLIToolConfig) => {
				new Setting(contentEl)
					.setName(`⌨️ ${tool.name}`)
					.setDesc(tool.description || tool.command)
					.addToggle(toggle => {
						toggle.setValue(this.hasCli(tool.id));
						toggle.onChange(value => this.setCli(tool.id, value));
						cliToolToggles.push({ id: tool.id, toggle });
					});
			});
		} else {
			new Setting(contentEl)
				.setName(t('modals.agentEdit.tools.cli.name'))
				.setDesc(t('modals.agentEdit.tools.cli.noTools'));
		}

		// MCP Servers
		contentEl.createEl('h3', { text: t('modals.agentEdit.mcp.title') });
		if (this.plugin.settings.mcpServers.length === 0) {
			const empty = contentEl.createDiv('ia-table-subtext');
			empty.setText(t('modals.agentEdit.mcp.noServers'));
		} else {
			const mcpContainer = contentEl.createDiv('ia-mcp-control');
			this.plugin.settings.mcpServers.forEach(server => {
				this.renderMcpServerControls(mcpContainer, server);
			});
		}

		// Buttons
		const buttonContainer = contentEl.createDiv('ia-modal-footer');
		buttonContainer.removeClass('ia-hidden');

		new ButtonComponent(buttonContainer)
			.setButtonText(t('modals.confirm.cancel'))
			.onClick(() => {
				this.close();
			});

		new ButtonComponent(buttonContainer)
			.setButtonText(t('modals.confirm.confirm'))
			.setCta()
			.onClick(() => {
				void (async () => {
					if (this.selectedSystemPromptId === '__custom__') {
						const name = this.customPromptName?.trim();
						const content = this.customPromptContent?.trim();
						if (!name || !content) {
							new Notice(t('modals.agentEdit.notices.promptRequired'));
							return;
						}

						const timestamp = Date.now();
						const newPromptId = this.generateUniquePromptId(name);

						this.plugin.settings.systemPrompts.push({
							id: newPromptId,
							name,
							content,
							enabled: true,
							createdAt: timestamp,
							updatedAt: timestamp
						});
						this.agent.systemPromptId = newPromptId;
						this.selectedSystemPromptId = newPromptId;
					} else {
						this.agent.systemPromptId = this.selectedSystemPromptId;
					}

					// All edits already mutate this.agent.toolAccess directly;
					// no recompute step needed.
				this.agent.updatedAt = Date.now();
					await this.onSaveCallback(this.agent);
					this.close();
				})();
			});
	}

	// ── toolAccess-native helpers ──────────────────────────────────────
	// Read/write agent.toolAccess.sources directly. Keys are
	// `${kind}:${sourceId}`; values are 'all' or an array of toolIds.

	private sources(): Record<string, 'all' | string[]> {
		return this.agent.toolAccess.sources;
	}

	private hasBuiltinTool(type: string): boolean {
		const rule = this.sources()['builtin:builtin'];
		if (rule === 'all') return true;
		return rule?.includes(`builtin:builtin:${type}`) ?? false;
	}

	private setBuiltinTool(type: string, enabled: boolean): void {
		const key = 'builtin:builtin';
		const toolId = `builtin:builtin:${type}`;
		const rule = this.sources()[key];
		// If currently 'all', materialize to an explicit list of globally-
		// enabled builtin tool ids before mutating, so the resulting state
		// is a stable array regardless of future builtin config changes.
		let next: string[];
		if (rule === 'all') {
			next = (this.plugin.settings.builtInTools ?? [])
				.filter((t) => t.enabled)
				.map((t) => `builtin:builtin:${t.type}`);
		} else {
			next = [...(rule ?? [])];
		}
		if (enabled && !next.includes(toolId)) next.push(toolId);
		if (!enabled) next = next.filter((id) => id !== toolId);
		if (next.length === 0) {
			delete this.sources()[key];
		} else {
			this.sources()[key] = next;
		}
	}

	private hasMcpServer(name: string): boolean {
		return this.sources()[`mcp:${name}`] === 'all';
	}

	private setMcpServerAll(name: string, enabled: boolean): void {
		const key = `mcp:${name}`;
		if (enabled) {
			this.sources()[key] = 'all';
		} else {
			delete this.sources()[key];
		}
	}

	private hasMcpTool(server: string, tool: string): boolean {
		const rule = this.sources()[`mcp:${server}`];
		if (rule === 'all') return true;
		return rule?.includes(`mcp:${server}:${tool}`) ?? false;
	}

	private setMcpTool(server: string, tool: string, enabled: boolean): void {
		const key = `mcp:${server}`;
		const toolId = `mcp:${server}:${tool}`;
		const rule = this.sources()[key];
		// Materialize 'all' to an explicit list before flipping a single
		// tool so the user's deselection actually sticks.
		let next: string[];
		if (rule === 'all') {
			const serverCfg = this.plugin.settings.mcpServers.find((s) => s.name === server);
			next = (serverCfg?.cachedTools ?? []).map((c) => `mcp:${server}:${c.name}`);
		} else {
			next = [...(rule ?? [])];
		}
		if (enabled && !next.includes(toolId)) next.push(toolId);
		if (!enabled) next = next.filter((id) => id !== toolId);
		if (next.length === 0) {
			delete this.sources()[key];
		} else {
			this.sources()[key] = next;
		}
	}

	private hasCli(id: string): boolean {
		// A CLI source is binary: enabled = present (as 'all'), disabled = absent.
		return this.sources()[`cli:${id}`] !== undefined;
	}

	private setCli(id: string, enabled: boolean): void {
		const key = `cli:${id}`;
		if (enabled) {
			this.sources()[key] = 'all';
		} else {
			delete this.sources()[key];
		}
	}

	/** True iff every globally-enabled CLI tool is also enabled on this agent. */
	private allCliEnabled(enabledCliConfigs: CLIToolConfig[]): boolean {
		return enabledCliConfigs.length > 0
			&& enabledCliConfigs.every((c) => this.hasCli(c.id));
	}

	private buildModelOptions(): Array<{ id: string; label: string }> {
		const options: Array<{ id: string; label: string }> = [];
		const seen = new Set<string>();
		this.modelAliasMap.clear();

		for (const config of this.plugin.settings.llmConfigs) {
			const models = config.cachedModels ?? [];
			for (const model of models) {
				if (!seen.has(model.id)) {
					const providerLabel = this.formatLabel(model.provider || config.provider);
					options.push({ id: model.id, label: `${model.name} • ${providerLabel}` });
					seen.add(model.id);
				}

				const alias = this.normalizeModelId(model.id);
				if (alias && alias !== model.id) {
					this.modelAliasMap.set(alias, model.id);
				}
			}
		}

		options.sort((a, b) => a.label.localeCompare(b.label));
		return options;
	}

	private renderMcpServerControls(container: HTMLElement, server: MCPServerConfig) {
		const wrapper = container.createDiv('ia-mcp-server');
		const toolEntries: Array<{ toolName: string; toggle: ToggleComponent; statusEl: HTMLElement }> = [];
		const hasTools = Boolean(server.cachedTools && server.cachedTools.length > 0);
		let toolsContainer: HTMLElement | null = null;
		// Expand the tool list if the agent has any per-tool MCP overrides
		// for this server (array form) — otherwise keep it collapsed by default.
		const rule = this.sources()[`mcp:${server.name}`];
		let toolsVisible = hasTools && Array.isArray(rule);

		const serverSetting = new Setting(wrapper)
			.setName(server.name)
			.setDesc(hasTools
				? t(server.cachedTools!.length === 1 ? 'modals.agentEdit.mcp.toolsCached' : 'modals.agentEdit.mcp.toolsCached_plural', { count: server.cachedTools!.length })
				: t('modals.agentEdit.mcp.noToolsCached'));
		serverSetting.settingEl.addClass('ia-mcp-server-header');

		if (hasTools) {
			serverSetting.addExtraButton(button => {
				const updateButton = () => {
					button.setIcon(toolsVisible ? 'chevron-up' : 'chevron-down');
					button.setTooltip(toolsVisible ? t('modals.agentEdit.mcp.hideTools') : t('modals.agentEdit.mcp.showTools'));
				};
				updateButton();
				button.onClick(() => {
					toolsVisible = !toolsVisible;
					if (toolsContainer) {
						toolsContainer.classList.toggle('is-collapsed', !toolsVisible);
					}
					updateButton();
				});
			});
		}

		const serverStatus = serverSetting.controlEl.createDiv('ia-mcp-status');
		const updateServerStatus = () => {
			const selected = this.hasMcpServer(server.name);
			serverStatus.setText(selected ? t('modals.agentEdit.mcp.selected') : t('modals.agentEdit.mcp.notSelected'));
			serverStatus.toggleClass('is-selected', selected);
		};

		// Whole-server toggle: sets sources['mcp:server'] = 'all' or removes it.
		// When ON, per-tool toggles become disabled / forced-on. Flipping a
		// per-tool toggle OFF below switches the source to fine-grained mode
		// (an explicit array) — the server-level toggle then reflects "off".
		serverSetting.addToggle(toggle => {
			toggle.setValue(this.hasMcpServer(server.name));
			toggle.onChange(value => {
				this.setMcpServerAll(server.name, value);
				this.syncMcpToolStates(toolEntries, server.name);
				updateServerStatus();
			});
		});
		updateServerStatus();

		if (hasTools) {
			const containerEl = wrapper.createDiv('ia-mcp-tools');
			toolsContainer = containerEl;
			containerEl.classList.toggle('is-collapsed', !toolsVisible);
			server.cachedTools!
				.slice()
				.sort((a, b) => a.name.localeCompare(b.name))
				.forEach(tool => {
					const toolName = tool.name;
					const toolSetting = new Setting(containerEl)
						.setName(toolName)
						.setDesc(tool.description || '');
					toolSetting.settingEl.addClass('ia-mcp-tool-item');
					const statusEl = toolSetting.controlEl.createDiv('ia-mcp-status');
					const entry = { toolName, toggle: undefined as unknown as ToggleComponent, statusEl };
					toolSetting.addToggle(toggle => {
						toggle.setValue(this.hasMcpTool(server.name, toolName));
						toggle.onChange(value => {
							this.setMcpTool(server.name, toolName, value);
							this.syncMcpToolStates(toolEntries, server.name);
							updateServerStatus();
						});
						entry.toggle = toggle;
					});
					toolEntries.push(entry);
				});
		} else {
			const note = wrapper.createDiv('ia-mcp-tools-empty');
			note.addClass('ia-table-subtext');
			note.setText(t('modals.agentEdit.mcp.noToolsAvailable'));
		}

		this.syncMcpToolStates(toolEntries, server.name);
	}

	private syncMcpToolStates(entries: Array<{ toolName: string; toggle: ToggleComponent; statusEl: HTMLElement }>, serverName: string) {
		const useAll = this.hasMcpServer(serverName);
		entries.forEach(({ toolName, toggle, statusEl }) => {
			if (useAll) {
				if (!toggle.getValue()) {
					toggle.setValue(true);
				}
				toggle.setDisabled(true);
				statusEl.setText(t('modals.agentEdit.mcp.selected'));
				statusEl.toggleClass('is-selected', true);
			} else {
				toggle.setDisabled(false);
				const selected = this.hasMcpTool(serverName, toolName);
				if (toggle.getValue() !== selected) {
					toggle.setValue(selected);
				}
				statusEl.setText(selected ? t('modals.agentEdit.mcp.selected') : t('modals.agentEdit.mcp.notSelected'));
				statusEl.toggleClass('is-selected', selected);
			}
		});
	}

	/**
	 * After the master CLI toggle flips, sync each per-tool toggle's
	 * displayed value to whatever toolAccess now says.
	 */
	private refreshCliPerToolToggles(entries: Array<{ id: string; toggle: ToggleComponent }>) {
		entries.forEach(({ id, toggle }) => {
			const desired = this.hasCli(id);
			if (toggle.getValue() !== desired) {
				toggle.setValue(desired);
			}
		});
	}

	private getInitialModelSelection(options: Array<{ id: string; label: string }>): string {
		if (options.length === 0) {
			return this.agent.modelStrategy.modelId || '';
		}

		const current = this.agent.modelStrategy.modelId;
		if (current && options.some(option => option.id === current)) {
			return current;
		}

		if (current) {
			const alias = this.modelAliasMap.get(current);
			if (alias && options.some(option => option.id === alias)) {
				return alias;
			}
		}

		return options[0].id;
	}

	private normalizeModelId(modelId: string): string | null {
		if (!modelId) return null;
		return modelId.includes(':') ? modelId.split(':').slice(1).join(':') : modelId;
	}

	private formatLabel(value: string): string {
		return value.split(/[-_]/g).map(word => {
			if (!word) return word;
			if (word.length <= 2) return word.toUpperCase();
			return word.charAt(0).toUpperCase() + word.slice(1);
		}).join(' ');
	}

	private ensureCustomPromptDefaults() {
		if (!this.customPromptName || this.customPromptName.trim().length === 0) {
			this.customPromptName = `${this.agent.name} Prompt`;
		}
		if (!this.customPromptContent || this.customPromptContent.trim().length === 0) {
			this.customPromptContent = 'You are a helpful assistant for this Obsidian vault.';
		}
	}

	private toggleCustomPromptSection(show: boolean) {
		if (this.customPromptSection) {
			this.customPromptSection.setCssProps({ 'display': show ? 'block' : 'none' });
		}
	}

	private generateUniquePromptId(base: string): string {
		const slug = (base || 'agent-prompt')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '');
		const prefix = slug ? `agent-${slug}` : 'agent-prompt';
		let candidate = prefix;
		let counter = 1;
		const existing = new Set(this.plugin.settings.systemPrompts.map(prompt => prompt.id));
		while (existing.has(candidate)) {
			candidate = `${prefix}-${counter++}`;
		}
		return candidate;
	}

	private updateModelControls() {
		if (this.fixedModelSetting) {
			if (this.agent.modelStrategy.strategy === 'fixed') {
				this.fixedModelSetting.settingEl.show();
			} else {
				this.fixedModelSetting.settingEl.hide();
			}
		}
	}

	private getInitialModelSelectionForStrategy(options: Array<{ id: string; label: string }>): string {
		if (options.length === 0) {
			return this.agent.modelStrategy.modelId || '';
		}

		// If the agent already has a fixed model, try to find it in the options
		if (this.agent.modelStrategy.strategy === 'fixed' && this.agent.modelStrategy.modelId) {
			const current = this.agent.modelStrategy.modelId;
			if (options.some(option => option.id === current)) {
				return current;
			}

			// Check if there's an alias
			const alias = this.modelAliasMap.get(current);
			if (alias && options.some(option => option.id === alias)) {
				return alias;
			}
		}

		// Default to the first option
		return options[0].id;
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
