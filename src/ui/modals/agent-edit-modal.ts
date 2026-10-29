import { App, ButtonComponent, Modal, Notice, Setting } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import type { Agent } from '@/features/agent';
import { t } from '@/i18n';
import { applyConfigFieldMetadata } from '@/ui/utils/config-field-metadata';
import { ToolAccessEditor } from '@/features/agent';
import { AgentToolAccessSection } from './agent-tool-access-section';
import { initialModelSelection, modelCatalog, uniquePromptId } from './agent-model-options';
import { TestIds } from '@/ui/utils/test-ids';

export class AgentEditModal extends Modal {
	private agent: Agent;
	private onSaveCallback: (agent: Agent) => void | Promise<void>;
	private plugin: IntelligenceAssistantPlugin;
	private selectedSystemPromptId: string;
	private customPromptName: string = '';
	private customPromptContent: string = '';
	private customPromptSection: HTMLElement | null = null;
	private fixedModelSetting: Setting | null = null;
	private readonly access: ToolAccessEditor;

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
		this.access = new ToolAccessEditor(this.agent.toolAccess);
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
		}).addText(text => {
			text.inputEl.setAttribute('data-testid', TestIds.settings.agentModalNameInput);
			text.setValue(this.agent.name)
				.onChange(value => {
					this.agent.name = value;
				});
		});

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
		const catalog = modelCatalog(this.plugin.settings.llmConfigs);
		const modelOptions = catalog.options;
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
				const initialModelId = initialModelSelection(catalog, this.agent.modelStrategy);
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

		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'agents[].autonomousWrite',
			label: '自主写入 / Autonomous write',
			description: '允许此 agent 直接应用写提案，跳过逐个 Apply 确认（删除操作仍需确认）。也可在消息中说"自主完成/不需要确认"按单次任务临时开启。'
		}).addToggle(toggle => toggle
				.setValue(this.agent.autonomousWrite ?? false)
				.onChange(value => {
					this.agent.autonomousWrite = value;
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
				.setLimits(1, 50, 1)
				.setValue(this.agent.maxSteps)
				.onChange(value => {
					this.agent.maxSteps = value;
				}));

		new AgentToolAccessSection(this.plugin, this.access).render(contentEl);

		// Buttons
		const buttonContainer = contentEl.createDiv('ia-modal-footer');
		buttonContainer.removeClass('ia-hidden');

		new ButtonComponent(buttonContainer)
			.setButtonText(t('modals.confirm.cancel'))
			.onClick(() => {
				this.close();
			});

		const saveButton = new ButtonComponent(buttonContainer)
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
						const newPromptId = uniquePromptId(name, this.plugin.settings.systemPrompts.map(prompt => prompt.id));

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
		saveButton.buttonEl.setAttribute('data-testid', TestIds.settings.agentModalSaveBtn);
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
			this.customPromptSection.toggleClass('ia-hidden', !show);
		}
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

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
