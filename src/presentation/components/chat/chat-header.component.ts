import { App, setIcon, Notice } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import { ChatViewState } from '@/presentation/state/chat-view-state';
import { ConversationManager } from './managers/conversation-manager';
import type { ModelInfo } from '@/types';

export interface ChatHeaderCallbacks {
	onToggleConversations: () => Promise<void>;
	onNewChat: () => Promise<void>;
	onModelChange: () => Promise<void>;
	onSettingsOpen: () => void;
	onTemperatureChange: (val: number) => void;
	onMaxTokensChange: (val: number) => void;
	onTopPChange: (val: number) => void;
	onFrequencyPenaltyChange: (val: number) => void;
	onPresencePenaltyChange: (val: number) => void;
	onModeChange: (mode: 'chat' | 'agent') => Promise<void>;
	onPromptChange: (promptId: string | null) => Promise<void>;
	onAgentChange: (agentId: string) => Promise<void>;
}

export class ChatHeaderComponent {
	public modelSelect: HTMLSelectElement;
	public conversationTitleEl: HTMLElement;
	public modelCountEl: HTMLElement;
	public tokenSummaryEl: HTMLElement;
	public temperatureSlider: HTMLInputElement;
	public temperatureValueEl: HTMLElement;
	public maxTokensInput: HTMLInputElement;
	public topPSlider: HTMLInputElement;
	public topPValueEl: HTMLElement;
	public frequencyPenaltySlider: HTMLInputElement;
	public frequencyPenaltyValueEl: HTMLElement;
	public presencePenaltySlider: HTMLInputElement;
	public presencePenaltyValueEl: HTMLElement;
	public agentConfigSummaryEl: HTMLElement;
	public agentSummaryDetailsEl: HTMLElement;
	public agentSummaryTitleEl: HTMLElement;

	public modeSelector: HTMLSelectElement;
	public promptSelector: HTMLSelectElement;
	public agentSelector: HTMLSelectElement;
	public promptSelectorGroup: HTMLElement;
	public agentSelectorGroup: HTMLElement;
	public modelControlsContainer: HTMLElement;

	constructor(
		private parent: HTMLElement,
		private app: App,
		private plugin: IntelligenceAssistantPlugin,
		private state: ChatViewState,
		private callbacks: ChatHeaderCallbacks
	) {
		this.render();
	}

	private render() {
		// Toolbar Row A: breadcrumb + actions
		this.createActionRow(this.parent);

		// Toolbar Row B: mode + model + agent/prompt + token summary
		const toolbarB = this.parent.createDiv('chat-toolbar-b');
		this.createTopControls(toolbarB);
		this.createModelRow(toolbarB);
		this.createTokenRow(toolbarB);
	}

	private createActionRow(parent: HTMLElement) {
		const row = parent.createDiv('chat-action-row');

		const breadcrumb = row.createDiv('chat-breadcrumb');
		const historyBtn = breadcrumb.createEl('button', { cls: 'chat-breadcrumb-link chat-action-btn ia-history-btn' });
		setIcon(historyBtn.createSpan({ cls: 'chat-action-icon' }), 'list');
		historyBtn.createSpan({ text: 'Conversations', cls: 'chat-action-text' });
		historyBtn.setAttr('title', 'Toggle conversation list');
		historyBtn.addEventListener('click', (event: MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
			void this.callbacks.onToggleConversations();
		});
		breadcrumb.createSpan({ text: '/', cls: 'chat-breadcrumb-sep' });
		this.conversationTitleEl = breadcrumb.createSpan({ text: 'Current conversation', cls: 'chat-breadcrumb-current' });

		const actions = row.createDiv('chat-action-buttons');

		const newLink = actions.createSpan({ cls: 'chat-action-btn' });
		setIcon(newLink.createSpan({ cls: 'chat-action-icon' }), 'plus');
		newLink.createSpan({ text: 'New', cls: 'chat-action-text' });
		newLink.setAttr('role', 'button');
		newLink.tabIndex = 0;
		const activateNew = async (event: Event) => {
			event.preventDefault();
			event.stopPropagation();
			await this.callbacks.onNewChat();
		};
		newLink.addEventListener('click', (event: MouseEvent) => { void activateNew(event); });
		newLink.addEventListener('keydown', (event: KeyboardEvent) => {
			if (event.key === 'Enter' || event.key === ' ') {
				void activateNew(event);
			}
		});

		const settingsLink = actions.createSpan({ cls: 'chat-action-btn' });
		setIcon(settingsLink.createSpan({ cls: 'chat-action-icon' }), 'settings');
		settingsLink.createSpan({ text: 'Settings', cls: 'chat-action-text' });
		settingsLink.setAttr('role', 'button');
		settingsLink.setAttr('title', 'Open plugin settings');
		settingsLink.tabIndex = 0;
		settingsLink.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.callbacks.onSettingsOpen();
		});
	}

	private createTopControls(parent: HTMLElement) {
		const topControls = parent.createDiv('chat-top-controls');

		const modeGroup = topControls.createDiv('chat-select-group');
		modeGroup.createSpan({ text: 'Mode', cls: 'chat-label' });
		this.modeSelector = modeGroup.createEl('select', { cls: 'mode-selector' });
		this.modeSelector.createEl('option', { value: 'chat', text: 'Chat' });
		this.modeSelector.createEl('option', { value: 'agent', text: 'Agent' });
		this.modeSelector.value = this.state.mode;
		this.modeSelector.addEventListener('change', () => {
			const value = (this.modeSelector.value ?? 'chat') as 'chat' | 'agent';
			void this.callbacks.onModeChange(value);
		});

		this.promptSelectorGroup = topControls.createDiv('chat-select-group');
		this.promptSelectorGroup.createSpan({ text: 'Prompt', cls: 'chat-label' });
		this.promptSelector = this.promptSelectorGroup.createEl('select', { cls: 'prompt-selector' });
		this.populatePromptSelectorOptions();
		this.promptSelector.addEventListener('change', () => {
			void this.callbacks.onPromptChange(this.promptSelector.value || null);
		});

		this.agentSelectorGroup = topControls.createDiv('chat-select-group');
		this.agentSelectorGroup.createSpan({ text: 'Agent', cls: 'chat-label' });
		this.agentSelector = this.agentSelectorGroup.createEl('select', { cls: 'agent-selector' });
		this.agentSelector.addEventListener('change', () => {
			void this.callbacks.onAgentChange(this.agentSelector.value ?? '');
		});

		this.refreshAgentSelect();
		this.updatePromptSelectorVisibility();
		this.updateAgentSelectorVisibility();
	}

	public populatePromptSelectorOptions() {
		if (!this.promptSelector) return;
		const enabledPrompts = this.plugin.settings.systemPrompts.filter(p => p.enabled);
		this.promptSelector.empty();
		this.promptSelector.createEl('option', { value: '', text: 'No system prompt' });
		enabledPrompts.forEach(p => {
			const option = this.promptSelector.createEl('option', { value: p.id, text: p.name });
			if (this.plugin.settings.activeSystemPromptId === p.id) {
				option.selected = true;
			}
		});
	}

	public refreshAgentSelect(selectedId?: string) {
		if (!this.agentSelector) return;

		this.agentSelector.empty();
		const agents = this.plugin.settings.agents || [];

		if (agents.length === 0) {
			this.agentSelector.createEl('option', { value: '', text: 'No agents available' });
			return;
		}

		const activeId = selectedId || this.plugin.settings.activeAgentId || '';

		agents.forEach(agent => {
			const option = this.agentSelector.createEl('option', { value: agent.id, text: `${agent.icon || '🤖'} ${agent.name}` });
			if (agent.id === activeId) option.selected = true;
		});
	}

	public updatePromptSelectorVisibility() {
		if (this.promptSelectorGroup) {
			this.promptSelectorGroup.toggleClass('ia-hidden', this.state.mode !== 'chat');
		}
	}

	public updateAgentSelectorVisibility() {
		if (this.agentSelectorGroup) {
			this.agentSelectorGroup.toggleClass('ia-hidden', this.state.mode !== 'agent');
		}
	}

	public updateModeSelector(mode: 'chat' | 'agent') {
		if (this.modeSelector) {
			this.modeSelector.value = mode;
		}
	}

	private createModelRow(parent: HTMLElement) {
		const row = parent.createDiv('chat-model-row');
		const modelControlsContainer = row.createDiv('chat-model-controls');
		modelControlsContainer.addClass('ia-chat-model-controls');

		const modelGroup = modelControlsContainer.createDiv('chat-select-group');
		modelGroup.addClass('ia-model-select-group');
		modelGroup.addClass('chat-model-select');
		modelGroup.createSpan({ text: 'Model', cls: 'chat-label' });
		this.modelSelect = modelGroup.createEl('select', { cls: 'model-select' });
		this.modelSelect.addClass('ia-model-select');
		this.modelSelect.addEventListener('change', () => {
			void this.callbacks.onModelChange();
		});

		// Settings toggle button
		const settingsBtn = modelControlsContainer.createEl('button', { cls: 'chat-params-toggle' });
		setIcon(settingsBtn, 'sliders-horizontal');
		settingsBtn.title = 'Advanced parameters';
		settingsBtn.addClass('ia-icon-btn');

		const paramsContainer = modelControlsContainer.createDiv('chat-params-container');
		paramsContainer.addClass('ia-hidden');

		settingsBtn.addEventListener('click', () => {
			const isHidden = paramsContainer.hasClass('ia-hidden');
			if (isHidden) {
				paramsContainer.removeClass('ia-hidden');
				settingsBtn.addClass('is-active');
			} else {
				paramsContainer.addClass('ia-hidden');
				settingsBtn.removeClass('is-active');
			}
		});

		// Temperature
		const tempGroup = paramsContainer.createDiv('chat-param-group');
		tempGroup.createSpan({ text: 'Temperature', cls: 'chat-label' });
		this.temperatureSlider = tempGroup.createEl('input', { type: 'range' });
		this.temperatureSlider.min = '0';
		this.temperatureSlider.max = '2';
		this.temperatureSlider.step = '0.1';
		this.temperatureSlider.value = this.state.temperature.toString();
		this.temperatureSlider.addClass('chat-slider');
		this.temperatureValueEl = tempGroup.createSpan({ text: this.formatTemperature(this.state.temperature), cls: 'chat-param-value' });
		this.temperatureSlider.addEventListener('input', () => {
			const val = parseFloat(this.temperatureSlider.value);
			this.callbacks.onTemperatureChange(val);
			this.updateTemperatureDisplay(val);
		});

		// Max Tokens
		const tokensGroup = paramsContainer.createDiv('chat-param-group');
		tokensGroup.createSpan({ text: 'Max tokens', cls: 'chat-label' });
		this.maxTokensInput = tokensGroup.createEl('input', { type: 'number', cls: 'chat-number-input' });
		this.maxTokensInput.value = this.state.maxTokens.toString();
		this.maxTokensInput.addEventListener('input', () => {
			const value = parseInt(this.maxTokensInput.value);
			if (!isNaN(value) && value > 0) {
				this.callbacks.onMaxTokensChange(value);
			}
		});

		// Top P
		const topPGroup = paramsContainer.createDiv('chat-param-group');
		topPGroup.createSpan({ text: 'Top P', cls: 'chat-label' });
		this.topPSlider = topPGroup.createEl('input', { type: 'range' });
		this.topPSlider.min = '0';
		this.topPSlider.max = '1';
		this.topPSlider.step = '0.05';
		this.topPSlider.value = this.state.topP.toString();
		this.topPSlider.addClass('chat-slider');
		this.topPValueEl = topPGroup.createSpan({ text: this.state.topP.toFixed(2), cls: 'chat-param-value' });
		this.topPSlider.addEventListener('input', () => {
			const val = parseFloat(this.topPSlider.value);
			this.callbacks.onTopPChange(val);
			this.topPValueEl.setText(val.toFixed(2));
		});

		// Frequency Penalty
		const freqGroup = paramsContainer.createDiv('chat-param-group');
		freqGroup.createSpan({ text: 'Freq. penalty', cls: 'chat-label' });
		this.frequencyPenaltySlider = freqGroup.createEl('input', { type: 'range' });
		this.frequencyPenaltySlider.min = '-2';
		this.frequencyPenaltySlider.max = '2';
		this.frequencyPenaltySlider.step = '0.1';
		this.frequencyPenaltySlider.value = this.state.frequencyPenalty.toString();
		this.frequencyPenaltySlider.addClass('chat-slider');
		this.frequencyPenaltyValueEl = freqGroup.createSpan({ text: this.state.frequencyPenalty.toFixed(1), cls: 'chat-param-value' });
		this.frequencyPenaltySlider.addEventListener('input', () => {
			const val = parseFloat(this.frequencyPenaltySlider.value);
			this.callbacks.onFrequencyPenaltyChange(val);
			this.frequencyPenaltyValueEl.setText(val.toFixed(1));
		});

		// Presence Penalty
		const presGroup = paramsContainer.createDiv('chat-param-group');
		presGroup.createSpan({ text: 'Pres. penalty', cls: 'chat-label' });
		this.presencePenaltySlider = presGroup.createEl('input', { type: 'range' });
		this.presencePenaltySlider.min = '-2';
		this.presencePenaltySlider.max = '2';
		this.presencePenaltySlider.step = '0.1';
		this.presencePenaltySlider.value = this.state.presencePenalty.toString();
		this.presencePenaltySlider.addClass('chat-slider');
		this.presencePenaltyValueEl = presGroup.createSpan({ text: this.state.presencePenalty.toFixed(1), cls: 'chat-param-value' });
		this.presencePenaltySlider.addEventListener('input', () => {
			const val = parseFloat(this.presencePenaltySlider.value);
			this.callbacks.onPresencePenaltyChange(val);
			this.presencePenaltyValueEl.setText(val.toFixed(1));
		});

		this.agentConfigSummaryEl = row.createDiv('chat-agent-summary');
		this.agentConfigSummaryEl.addClass('ia-hidden');
		this.agentSummaryTitleEl = this.agentConfigSummaryEl.createSpan({ text: 'Agent configuration' });
		this.agentSummaryDetailsEl = this.agentConfigSummaryEl.createDiv('chat-agent-summary-details');
	}

	private createTokenRow(parent: HTMLElement) {
		const row = parent.createDiv('chat-token-row');
		this.modelCountEl = row.createSpan({ cls: 'chat-token-chip', text: 'Models: 0' });
		this.tokenSummaryEl = row.createSpan({ cls: 'chat-token-chip', text: 'Tokens: 0' });
	}

	private formatTemperature(temp: number): string {
		if (temp === 0) return '0 (Precise)';
		if (temp === 1) return '1 (Balanced)';
		if (temp === 2) return '2 (Creative)';
		return temp.toString();
	}

	public updateTemperatureDisplay(temp: number) {
		if (this.temperatureValueEl) {
			this.temperatureValueEl.setText(this.formatTemperature(temp));
		}
		if (this.temperatureSlider) {
			this.temperatureSlider.value = temp.toString();
		}
	}

	public updateConversationTitle(title: string) {
		if (this.conversationTitleEl) {
			this.conversationTitleEl.setText(title || 'Current conversation');
		}
	}

	public updateTokenSummary(text: string) {
		if (this.tokenSummaryEl) {
			this.tokenSummaryEl.setText(text);
		}
	}

	public updateModelCount(count: number) {
		if (this.modelCountEl) {
			this.modelCountEl.setText(`Models: ${count}`);
		}
	}

	public updateModelOptions() {
		if (!this.modelSelect) return;
		this.modelSelect.empty();

		if (this.modelCountEl) {
			this.modelCountEl.setText(`Models: ${this.state.availableModels.length}`);
		}

		if (this.state.availableModels.length === 0) {
			const option = this.modelSelect.createEl('option', { text: 'No models available' });
			option.value = '';
			option.disabled = true;
			return;
		}

		const defaultModel = this.plugin.settings.defaultModel;

		// Group by provider
		const groupedModels = this.state.availableModels.reduce((acc, model) => {
			if (!acc[model.provider]) {
				acc[model.provider] = [];
			}
			acc[model.provider].push(model);
			return acc;
		}, {} as Record<string, ModelInfo[]>);

		// Sort providers: put providers with default model first
		const sortedProviders = Object.entries(groupedModels).sort(([providerA, modelsA], [providerB, modelsB]) => {
			const aHasDefault = modelsA.some(m => m.id === defaultModel);
			const bHasDefault = modelsB.some(m => m.id === defaultModel);
			if (aHasDefault && !bHasDefault) return -1;
			if (!aHasDefault && bHasDefault) return 1;
			return providerA.localeCompare(providerB);
		});

		// Add options grouped by provider
		sortedProviders.forEach(([provider, models]) => {
			const optgroup = this.modelSelect.createEl('optgroup');
			optgroup.label = `${provider.toUpperCase()} (${models.length})`;

			// Sort models: default first, then alphabetically
			const sortedModels = [...models].sort((a, b) => {
				if (a.id === defaultModel) return -1;
				if (b.id === defaultModel) return 1;
				return a.name.localeCompare(b.name);
			});

			sortedModels.forEach(model => {
				const option = optgroup.createEl('option', { value: model.id, text: model.name });
				if (model.id === defaultModel) {
					option.selected = true;
				}
			});
		});
	}

	public updateAgentSummaryVisibility(visible: boolean) {
		if (this.agentConfigSummaryEl) {
			this.agentConfigSummaryEl.toggleClass('ia-hidden', !visible);
		}
	}

	public updateModelControlsVisibility(visible: boolean) {
		if (this.modelControlsContainer) {
			this.modelControlsContainer.toggleClass('ia-hidden', !visible);
		}
	}
}
