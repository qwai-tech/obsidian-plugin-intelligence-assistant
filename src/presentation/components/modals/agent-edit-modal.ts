import { App, ButtonComponent, Modal, Notice, Setting, ToggleComponent } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import type {Agent, BuiltInToolConfig, MCPServerConfig} from '@/types';
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
		this.agent.enabledBuiltInTools = this.agent.enabledBuiltInTools ?? [];
		this.agent.enabledMcpServers = this.agent.enabledMcpServers ?? [];
		this.agent.enabledMcpTools = this.agent.enabledMcpTools ?? [];
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Edit agent' });

		// Icon field
		new Setting(contentEl)
			.setName('Icon')
			.setDesc('Emoji or character to represent this agent')
			.addText(text => text
				.setValue(this.agent.icon)
				.onChange(value => {
					this.agent.icon = value;
				}));

		// Name field
		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'agents[].name',
			label: 'Name',
			description: 'Display name for this agent'
		}).addText(text => text
				.setValue(this.agent.name)
				.onChange(value => {
					this.agent.name = value;
				}));

		// Description field
		new Setting(contentEl)
			.setName('Description')
			.setDesc('Brief description of the agent')
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
			label: 'Model strategy',
			description: 'Choose how the agent will select its model'
		}).addDropdown(dropdown => {
				dropdown
					.addOption('Default', 'Use default model (from settings)')
					.addOption('Chat-view', 'Use chat view model')
					.addOption('Fixed', 'Fixed model');
				
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
			label: 'Fixed model',
			description: hasCachedModels
				? 'Select a specific model for this agent.'
				: 'No cached models available. Refresh models in the Models tab.'
		})
			.addDropdown(dropdown => {
				if (!hasCachedModels) {
					dropdown.addOption('', 'No models cached');
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
			label: 'Temperature',
			description: 'Controls randomness (0.0 - 2.0)'
		}).addSlider(slider => slider
				.setLimits(0, 2, 0.1)
				.setValue(this.agent.temperature)
				.onChange(value => {
					this.agent.temperature = value;
				}));

		// Max Tokens field
		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'agents[].maxTokens',
			label: 'Max tokens',
			description: 'Maximum number of tokens to generate'
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
			label: 'Context window',
			description: 'Number of previous messages to include in context'
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
			label: 'System prompt',
			description: 'Choose from existing prompts or define a new one for this agent.'
		}).addDropdown(dropdown => {
				prompts.forEach(prompt => {
					dropdown.addOption(prompt.id, prompt.name);
				});
				dropdown.addOption('__custom__', '➕ create new prompt…');
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

		this.customPromptSection = contentEl.createDiv();
		this.customPromptSection.setCssProps({ 'margin-top': '12px' });
		this.toggleCustomPromptSection(this.selectedSystemPromptId === '__custom__');

		new Setting(this.customPromptSection)
			.setName('Prompt name')
			.setDesc('Display name for the new system prompt')
			.addText(text => {
				customNameInput = text.inputEl;
				text.setValue(this.customPromptName);
				text.onChange(value => {
					this.customPromptName = value;
				});
			});

		new Setting(this.customPromptSection)
			.setName('Prompt content')
			.setDesc('Content for the new system prompt')
			.addTextArea(text => {
				customContentInput = text.inputEl;
				text.setValue(this.customPromptContent);
				text.inputEl.rows = 10;
				text.inputEl.setCssProps({ 'width': '100%' });
				text.inputEl.setCssProps({ 'font-family': 'var(--font-monospace)' });
				text.inputEl.setCssProps({ 'font-size': '12px' });
				text.onChange(value => {
					this.customPromptContent = value;
				});
			});

		// Capabilities section
		contentEl.createEl('h3', { text: 'Capabilities' });

		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'agents[].ragEnabled',
			label: 'RAG',
			description: 'Enable retrieval augmented generation'
		}).addToggle(toggle => toggle
				.setValue(this.agent.ragEnabled)
				.onChange(value => {
					this.agent.ragEnabled = value;
				}));

		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'agents[].webSearchEnabled',
			label: 'Web search',
			description: 'Enable web search capabilities'
		}).addToggle(toggle => toggle
				.setValue(this.agent.webSearchEnabled)
				.onChange(value => {
					this.agent.webSearchEnabled = value;
				}));

		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'agents[].reactEnabled',
			label: 'ReAct Mode',
			description: 'Enable ReAct (Reasoning + Acting) agent pattern'
		}).addToggle(toggle => toggle
				.setValue(this.agent.reactEnabled)
				.onChange(value => {
					this.agent.reactEnabled = value;
				}));

		if (this.agent.reactEnabled) {
			applyConfigFieldMetadata(new Setting(contentEl), {
				path: 'agents[].reactMaxSteps',
				label: 'ReAct Max Steps',
				description: 'Maximum number of steps in ReAct loop'
			}).addSlider(slider => slider
					.setLimits(1, 20, 1)
					.setValue(this.agent.reactMaxSteps)
					.onChange(value => {
						this.agent.reactMaxSteps = value;
					}));

			applyConfigFieldMetadata(new Setting(contentEl), {
				path: 'agents[].reactAutoContinue',
				label: 'ReAct Auto Continue',
				description: 'Automatically continue ReAct loop'
			}).addToggle(toggle => toggle
					.setValue(this.agent.reactAutoContinue)
					.onChange(value => {
						this.agent.reactAutoContinue = value;
					}));
		}

		// Memory settings placeholder (temporarily disabled)
		contentEl.createEl('h3', { text: 'Memory' });
		const memoryNotice = contentEl.createEl('p', {
			text: 'Agent memory is temporarily unavailable while we iterate on the experience.'
		});
		memoryNotice.addClass('ia-section-description');

		// Built-in Tools
		contentEl.createEl('h3', { text: 'Tools' });

		// Built-in tools
		new Setting(contentEl)
			.setName('Built-in tools')
			.setDesc('Select which built-in tools this agent can use');

		this.plugin.settings.builtInTools.forEach((tool: BuiltInToolConfig) => {
			new Setting(contentEl)
				.setName(tool.type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()))
				.addToggle(toggle => toggle
					.setValue(this.agent.enabledBuiltInTools.includes(tool.type))
					.onChange(value => {
						if (value) {
							if (!this.agent.enabledBuiltInTools.includes(tool.type)) {
								this.agent.enabledBuiltInTools.push(tool.type);
							}
						} else {
							const index = this.agent.enabledBuiltInTools.indexOf(tool.type);
							if (index > -1) {
								this.agent.enabledBuiltInTools.splice(index, 1);
							}
						}
					}));
		});

		// MCP Servers
		contentEl.createEl('h3', { text: 'Mcp access' });
		if (this.plugin.settings.mcpServers.length === 0) {
			const empty = contentEl.createDiv('ia-table-subtext');
			empty.setText('No mcp servers configured. Add servers under settings → mcp to unlock these options.');
		} else {
			const mcpContainer = contentEl.createDiv('ia-mcp-control');
			this.plugin.settings.mcpServers.forEach(server => {
				this.renderMcpServerControls(mcpContainer, server);
			});
		}

		// Buttons
		const buttonContainer = contentEl.createDiv();
		buttonContainer.removeClass('ia-hidden');
		buttonContainer.setCssProps({ 'justify-content': 'flex-end' });
		buttonContainer.setCssProps({ 'gap': '8px' });
		buttonContainer.setCssProps({ 'margin-top': '16px' });

		new ButtonComponent(buttonContainer)
			.setButtonText('Cancel')
			.onClick(() => {
				this.close();
			});

		new ButtonComponent(buttonContainer)
			.setButtonText('Save')
			.setCta()
			.onClick(() => {
				void (async () => {
					if (this.selectedSystemPromptId === '__custom__') {
						const name = this.customPromptName?.trim();
						const content = this.customPromptContent?.trim();
						if (!name || !content) {
							new Notice('Please provide a name and content for the new system prompt.');
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

					this.agent.updatedAt = Date.now();
					await this.onSaveCallback(this.agent);
					this.close();
				})();
			});
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
		const toolEntries: Array<{ key: string; toggle: ToggleComponent; statusEl: HTMLElement }> = [];
		const hasTools = Boolean(server.cachedTools && server.cachedTools.length > 0);
		const serverKeyPrefix = `${server.name}::`;
		let toolsContainer: HTMLElement | null = null;
		let toolsVisible = hasTools && (this.agent.enabledMcpTools ?? []).some(key => key.startsWith(serverKeyPrefix));

		const serverSetting = new Setting(wrapper)
			.setName(server.name)
			.setDesc(hasTools
				? `${server.cachedTools!.length} tool${server.cachedTools!.length === 1 ? '' : 's'} cached`
				: 'No tools cached yet. Enable full access or refresh the cache.');
		serverSetting.settingEl.addClass('ia-mcp-server-header');

		if (hasTools) {
			serverSetting.addExtraButton(button => {
				const updateButton = () => {
					button.setIcon(toolsVisible ? 'chevron-up' : 'chevron-down');
					button.setTooltip(toolsVisible ? 'Hide tools' : 'Show tools');
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
			const selected = this.agent.enabledMcpServers.includes(server.name);
			serverStatus.setText(selected ? 'Selected' : 'Not selected');
			serverStatus.toggleClass('is-selected', selected);
		};

		serverSetting.addToggle(toggle => {
			const initial = this.agent.enabledMcpServers.includes(server.name);
			toggle.setValue(initial);
			toggle.onChange(value => {
				const list = this.agent.enabledMcpServers;
				const idx = list.indexOf(server.name);
				if (value && idx === -1) {
					list.push(server.name);
				} else if (!value && idx !== -1) {
					list.splice(idx, 1);
				}
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
					const key = this.buildMcpToolKey(server.name, tool.name);
					const toolSetting = new Setting(containerEl)
						.setName(tool.name)
						.setDesc(tool.description || '');
					toolSetting.settingEl.addClass('ia-mcp-tool-item');
					const statusEl = toolSetting.controlEl.createDiv('ia-mcp-status');
					const entry = { key, toggle: undefined as unknown as ToggleComponent, statusEl };
					toolSetting.addToggle(toggle => {
						toggle.setValue(this.agent.enabledMcpTools?.includes(key) ?? false);
						toggle.onChange(value => {
							const list = this.agent.enabledMcpTools ?? (this.agent.enabledMcpTools = []);
							const idx = list.indexOf(key);
							if (value && idx === -1) {
								list.push(key);
							} else if (!value && idx !== -1) {
								list.splice(idx, 1);
							}
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
			note.setText('No tools available from this server yet.');
		}

		this.syncMcpToolStates(toolEntries, server.name);
	}

	private syncMcpToolStates(entries: Array<{ key: string; toggle: ToggleComponent; statusEl: HTMLElement }>, serverName: string) {
		const useAll = this.agent.enabledMcpServers.includes(serverName);
		const list = this.agent.enabledMcpTools ?? (this.agent.enabledMcpTools = []);
		entries.forEach(({ key, toggle, statusEl }) => {
			if (useAll) {
				if (!list.includes(key)) {
					list.push(key);
				}
				if (!toggle.getValue()) {
					toggle.setValue(true);
				}
				toggle.setDisabled(true);
				statusEl.setText('Selected');
				statusEl.toggleClass('is-selected', true);
			} else {
				toggle.setDisabled(false);
				const selected = list.includes(key);
				if (toggle.getValue() !== selected) {
					toggle.setValue(selected);
				}
				statusEl.setText(selected ? 'Selected' : 'Not selected');
				statusEl.toggleClass('is-selected', selected);
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

	private buildMcpToolKey(serverName: string, toolName: string): string {
		return `${serverName}::${toolName}`;
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
