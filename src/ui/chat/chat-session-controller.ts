import { Notice, TFile, type TFolder } from 'obsidian';
import { ModelManager } from '@qwai/obsidian-llm';
import { t } from '@/i18n';
import type IntelligenceAssistantPlugin from '@plugin';
import type { Agent } from '@/features/agent';
import type { Conversation, ConversationConfig } from '@/features/conversations';
import type { PluginSettings } from '@/features/settings';
import {
	agentModelId,
	pickAgentId,
	selectionForConversation,
	selectionForNewChat,
	type ChatMode,
	type SessionSelection,
} from '@/features/chat';
import { buildAgentCapabilitySummary, resolveAgentToolsForAgent, type AgentCapabilitySummary } from '@/features/agent';
import type { ToolRegistry } from '@/features/tools';
import type { ChatViewState } from '@/ui/state/chat-view-state';
import type { ChatInputComponent } from './chat-input.component';
import { applyConversationSettings } from './conversation-settings';
import type { ChatHeaderComponent } from './chat-header.component';

const NEW_CHAT_SAMPLING = { temperature: 0.7, maxTokens: 4000, topP: 1.0, frequencyPenalty: 0, presencePenalty: 0 };

export interface ChatSessionControls {
	input: ChatInputComponent;
	header: ChatHeaderComponent;
	refreshRagStatus(): Promise<void>;
}

export class ChatSessionController {
	constructor(
		private readonly plugin: IntelligenceAssistantPlugin,
		private readonly state: ChatViewState,
		private readonly controls: ChatSessionControls,
	) {}

	private get settings(): PluginSettings {
		return this.plugin.settings;
	}

	activeAgent(): Agent | null {
		const activeId = this.settings.activeAgentId;
		return activeId ? this.settings.agents.find(agent => agent.id === activeId) ?? null : null;
	}

	ragActive(): boolean {
		const enabled = this.state.mode === 'agent' ? this.activeAgent()?.ragEnabled : this.state.enableRAG;
		return Boolean(enabled && this.settings.ragConfig.enabled);
	}

	webSearchActive(): boolean {
		const enabled = this.state.mode === 'agent' ? this.activeAgent()?.webSearchEnabled : this.state.enableWebSearch;
		return Boolean(enabled && this.settings.webSearchConfig.enabled);
	}

	capabilitySummary(registry: ToolRegistry, references: Array<TFile | TFolder>): AgentCapabilitySummary {
		const agent = this.activeAgent();
		return buildAgentCapabilitySummary({
			mode: this.state.mode,
			agent,
			tools: resolveAgentToolsForAgent(registry, agent),
			ragConfigured: this.settings.ragConfig.enabled,
			ragActive: this.ragActive(),
			webSearchConfigured: this.settings.webSearchConfig.enabled,
			webSearchActive: this.webSearchActive(),
			references: references.map(reference => ({
				type: reference instanceof TFile ? 'file' : 'folder',
				path: reference.path,
				name: reference.name,
			})),
		});
	}

	async changeMode(mode: ChatMode): Promise<void> {
		this.state.mode = mode;
		if (mode === 'agent') {
			if (!pickAgentId(this.settings)) {
				await this.plugin.ensureDefaultAgent();
			}
			const agentId = pickAgentId(this.settings);
			if (agentId) {
				await this.select(selectionForConversation(this.settings, 'agent', { agentId }));
				await this.applyAgent(agentId);
			} else {
				new Notice(t('chat.notices.noAgents'));
				await this.select({ activeAgentId: null, activeSystemPromptId: this.settings.activeSystemPromptId ?? null });
				this.controls.input.refreshAgentSelect();
			}
		} else {
			await this.select({ activeAgentId: null, activeSystemPromptId: this.settings.activeSystemPromptId ?? null });
		}

		this.controls.input.updateModeSelector(mode);
		const agent = mode === 'agent' ? this.activeAgent() : null;
		this.controls.header.updateAgentBadge(agent ? agent.name ?? 'unknown' : null);
		await this.refreshOptions();
	}

	async selectAgent(agentId: string): Promise<void> {
		this.state.mode = 'agent';
		this.controls.input.updateModeSelector('agent');
		if (!agentId) {
			await this.select({ activeAgentId: null, activeSystemPromptId: this.settings.activeSystemPromptId ?? null });
		} else if (this.settings.activeAgentId !== agentId) {
			await this.select(selectionForConversation(this.settings, 'agent', { agentId }));
			await this.applyAgent(agentId);
		}
		await this.refreshOptions();
	}

	async applyConversation(conversation: Conversation): Promise<void> {
		this.controls.input.updateModeSelector(this.state.mode);
		const config = conversation.config;
		if (!config) {
			await this.refreshOptions();
			return;
		}

		const selection = selectionForConversation(this.settings, this.state.mode, config);
		await this.select(selection);
		if (selection.activeAgentId) {
			await this.applyAgent(selection.activeAgentId, { silent: true });
		} else {
			this.controls.input.refreshAgentSelect();
		}
		this.controls.input.agentSelector.value = selection.activeAgentId ?? '';

		this.applyStoredConfig(config);
		await this.refreshOptions();
	}

	async startNewChat(): Promise<void> {
		const mode: ChatMode = this.settings.defaultChatMode === 'agent' ? 'agent' : 'chat';
		this.state.mode = mode;
		this.controls.input.updateModeSelector(mode);
		const selection = selectionForNewChat(this.settings, mode);
		await this.select(selection);

		if (selection.activeAgentId) {
			await this.applyAgent(selection.activeAgentId, { silent: true });
		} else {
			this.controls.header.updateAgentBadge(null);
			this.controls.input.refreshAgentSelect();
		}
		this.controls.input.agentSelector.value = selection.activeAgentId ?? '';

		if (mode === 'chat') {
			if (this.settings.defaultModel) {
				this.selectModel(this.settings.defaultModel);
			} else {
				this.controls.input.modelSelect.value = '';
			}
			Object.assign(this.state, NEW_CHAT_SAMPLING);
			this.state.enableRAG = false;
			this.state.enableWebSearch = false;
		}
		await this.refreshOptions();
	}

	async toggleRag(): Promise<void> {
		if (this.state.mode === 'agent') return;
		if (!this.settings.ragConfig.enabled) {
			new Notice(t('chat.notices.ragDisabled'));
			return;
		}
		this.state.enableRAG = !this.state.enableRAG;
		await this.refreshQuickActions();
		await this.controls.refreshRagStatus();
	}

	async toggleWebSearch(): Promise<void> {
		if (this.state.mode === 'agent') return;
		if (!this.settings.webSearchConfig.enabled) {
			new Notice(t('chat.notices.webSearchDisabled'));
			return;
		}
		this.state.enableWebSearch = !this.state.enableWebSearch;
		await this.refreshQuickActions();
	}

	async refreshOptions(): Promise<void> {
		this.controls.input.updateModeSelector(this.state.mode);
		await this.refreshQuickActions();
	}

	async refreshImageButton(): Promise<void> {
		const modelId = this.controls.input.modelSelect.value;
		if (!modelId) {
			this.controls.input.setImageButtonVisible(false);
			return;
		}
		const models = await ModelManager.getAllAvailableModels(this.settings.llmConfigs);
		const model = models.find(candidate => candidate.id === modelId);
		this.controls.input.setImageButtonVisible(Boolean(model?.capabilities?.includes('vision')));
	}

	selectModel(modelId: string | undefined): void {
		const select = this.controls.input.modelSelect;
		if (modelId && Array.from(select.options).some(option => option.value === modelId)) {
			select.value = modelId;
		}
	}

	private async refreshQuickActions(): Promise<void> {
		const { input } = this.controls;
		const label = (configured: boolean, on: boolean) =>
			configured ? t(on ? 'chat.agentSummary.on' : 'chat.agentSummary.off') : t('chat.status.disabled');
		if (input.ragActionItem) {
			const configured = this.settings.ragConfig.enabled;
			input.updateActionToggleState(input.ragActionItem, configured, this.state.enableRAG, label(configured, this.state.enableRAG));
		}
		if (input.webActionItem) {
			const configured = this.settings.webSearchConfig.enabled;
			input.updateActionToggleState(input.webActionItem, configured, this.state.enableWebSearch, label(configured, this.state.enableWebSearch));
		}
		await this.refreshImageButton();
	}

	private async applyAgent(agentId: string, options: { silent?: boolean } = {}): Promise<void> {
		const agent = this.settings.agents.find(candidate => candidate.id === agentId);
		if (!agent) return;

		this.state.temperature = agent.temperature;
		this.state.maxTokens = agent.maxTokens;
		const modelId = agentModelId(agent, this.controls.input.modelSelect.value, this.settings.defaultModel || '');
		if (modelId) {
			this.controls.input.modelSelect.value = modelId;
		}
		this.state.enableRAG = agent.ragEnabled;
		this.state.enableWebSearch = agent.webSearchEnabled;

		try {
			await this.controls.refreshRagStatus();
		} catch (error) {
			console.error('Error updating RAG with agent config:', error);
		}

		this.controls.input.refreshAgentSelect(agentId);
		this.controls.header.updateAgentBadge(agent.name ?? 'unknown');
		if (!options.silent) {
			new Notice(t('chat.notices.agentConfigApplied', { name: agent.name ?? 'unknown' }));
		}
	}

	private applyStoredConfig(config: ConversationConfig): void {
		this.selectModel(config.modelId);
		applyConversationSettings(this.state, config, this.state.mode);
	}

	private async select(selection: SessionSelection): Promise<void> {
		await this.plugin.updateSettings(settings => {
			settings.activeAgentId = selection.activeAgentId;
			settings.activeSystemPromptId = selection.activeSystemPromptId;
		});
	}
}
