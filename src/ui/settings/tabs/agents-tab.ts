/**
 * Agents Settings Tab
 * Displays agent management and configuration
 */

import { App } from 'obsidian';
import { showConfirm } from '@/ui/modals/confirm-modal';
import type IntelligenceAssistantPlugin from '@plugin';
import type { Agent } from '@/features/agent';
import type { ModelInfo } from '@/features/llm';
import { t } from '@/i18n';
import { TestIds } from '@/ui/utils/test-ids';
import { AgentEditModal } from '@/ui/modals/agent-edit-modal';
import { DEFAULT_AGENT_ID, DEFAULT_CHAT_SAMPLING, DEFAULT_MAX_STEPS, DEFAULT_MODEL_CONFIG } from '@/core/constants';
import { renderListRow, tagButton } from '@/ui/settings/list-row';

export function displayAgentsTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	app: App,
	refreshDisplay: () => void
): void {

	const desc = containerEl.createEl('p', {
		text: t('settings.agents.desc')
	});
	desc.addClass('ia-section-description');

	// Add new agent button
	const actionsRow = containerEl.createDiv('ia-section-actions');
	const agentSummary = actionsRow.createDiv('ia-section-summary');
	agentSummary.createSpan({ text: t('settings.agents.count', { count: plugin.settings.agents.length }) });

	const addBtn = actionsRow.createEl('button', { text: t('settings.agents.addBtn') });
	addBtn.addClass('ia-button');
	addBtn.addClass('ia-button--primary');
	addBtn.setAttribute('data-testid', TestIds.settings.agentAddBtn);
	addBtn.addEventListener('click', () => {
		const enabledTools = plugin.settings.builtInTools
			.filter(tool => tool.enabled)
			.map(tool => tool.type);
		const newAgent: Agent = {
			id: `agent-${Date.now()}`,
			name: 'New Agent',
			description: 'A helpful AI assistant',
			icon: 'bot',
			modelStrategy: {
				strategy: 'default',
				modelId: plugin.settings.defaultModel || DEFAULT_MODEL_CONFIG.FALLBACK_MODEL
			},
			temperature: DEFAULT_CHAT_SAMPLING.temperature,
			maxTokens: DEFAULT_CHAT_SAMPLING.maxTokens,
			systemPromptId: plugin.settings.systemPrompts[0]?.id || 'default',
			contextWindow: 20,
			toolAccess: enabledTools.length > 0
				? { sources: { 'builtin:builtin': enabledTools.map((name) => `builtin:builtin:${name}`) } }
				: { sources: {} },
			memoryType: 'none',
			memoryConfig: {
				summaryInterval: 10,
				maxMemories: 50
			},
			ragEnabled: false,
			webSearchEnabled: false,
			maxSteps: DEFAULT_MAX_STEPS,
			createdAt: Date.now(),
			updatedAt: Date.now()
		};
		void plugin.updateSettings((settings) => {
			settings.agents.push(newAgent);
		});
		refreshDisplay();
	});

	// Display existing agents in a table if they exist
	if (plugin.settings.agents.length === 0) {
		const emptyDiv = containerEl.createDiv('ia-empty-state');
		emptyDiv.setText(t('settings.agents.empty'));
		return;
	}

	const promptMap = new Map(plugin.settings.systemPrompts.map(prompt => [prompt.id, prompt]));
	const modelLookup = new Map<string, ModelInfo>();
	const registerModel = (key: string, model: ModelInfo) => {
		if (!modelLookup.has(key)) {
			modelLookup.set(key, model);
		}
	};
	const normalizeModelId = (modelId: string): string | null => {
		if (!modelId) return null;
		return modelId.includes(':') ? modelId.split(':').slice(1).join(':') : modelId;
	};

	for (const config of plugin.settings.llmConfigs) {
		const models = config.cachedModels ?? [];
		for (const model of models) {
			registerModel(model.id, model);
			const alias = normalizeModelId(model.id);
			if (alias) {
				registerModel(alias, model);
			}
		}
	}

	const agents = [...plugin.settings.agents].sort((a, b) => {
		const aDefault = a.id === DEFAULT_AGENT_ID;
		const bDefault = b.id === DEFAULT_AGENT_ID;
		if (aDefault && !bDefault) return -1;
		if (!aDefault && bDefault) return 1;
		return a.name.localeCompare(b.name);
	});

	for (const agent of agents) {
		agent.toolAccess ??= { sources: {} };
		const promptName = promptMap.get(agent.systemPromptId)?.name;
		const row = renderListRow(containerEl, {
			name: agent.name,
			icon: agent.icon,
			badges: agent.id === DEFAULT_AGENT_ID ? [t('settings.agents.defaultBadge')] : [],
			lines: [
				agent.description,
				[describeModel(agent), ...capabilities(agent), ...toolCounts(agent, plugin)].join(' · '),
				promptName ? t('settings.agents.systemPrompt', { promptName }) : t('settings.agents.customPrompt'),
			],
			testId: TestIds.settings.agentRow,
			attributes: { 'data-agent-id': agent.id, 'data-agent-name': agent.name },
		});

		row.addButton(button => {
			button.setButtonText(t('settings.agents.actions.edit'));
			tagButton(button.buttonEl, TestIds.settings.agentEditBtn, { 'data-agent-id': agent.id });
			button.onClick(() => {
				new AgentEditModal(app, plugin, agent, async (updatedAgent) => {
					const agentIndex = plugin.settings.agents.findIndex(a => a.id === updatedAgent.id);
					if (agentIndex !== -1) {
						await plugin.updateSettings((settings) => {
							settings.agents[agentIndex] = updatedAgent;
						});
						refreshDisplay();
					}
				}).open();
			});
		});

		if (agent.id !== DEFAULT_AGENT_ID && plugin.settings.agents.length > 1) {
			row.addButton(button => {
				button.setButtonText(t('settings.agents.actions.delete')).setDestructive();
				tagButton(button.buttonEl, TestIds.settings.agentDeleteBtn, { 'data-agent-id': agent.id });
				button.onClick(async () => {
					if (await showConfirm(app, t('settings.agents.confirm.delete', { name: agent.name }))) {
						await plugin.updateSettings((settings) => {
							settings.agents = settings.agents.filter(candidate => candidate.id !== agent.id);
						});
						refreshDisplay();
					}
				});
			});
		}
	}

	function describeModel(agent: Agent): string {
		const strategy = agent.modelStrategy;
		if (strategy.strategy === 'fixed' && strategy.modelId) {
			return modelLookup.get(strategy.modelId)?.name ?? strategy.modelId;
		}
		if (strategy.strategy === 'chat-view') return t('settings.agents.model.useChatView');
		if (strategy.strategy === 'default') return t('settings.agents.model.useDefault');
		return t('settings.agents.model.notSet');
	}
}

function capabilities(agent: Agent): string[] {
	return [agent.ragEnabled ? 'RAG' : '', agent.webSearchEnabled ? 'Web' : ''].filter(Boolean);
}

function toolCounts(agent: Agent, plugin: IntelligenceAssistantPlugin): string[] {
	const sources = agent.toolAccess?.sources ?? {};
	const builtInRule = sources['builtin:builtin'];
	const builtInCount = builtInRule === 'all'
		? plugin.settings.builtInTools.filter(tool => tool.enabled).length
		: (builtInRule?.length ?? 0);
	const mcpServerCount = Object.keys(sources).filter(key => key.startsWith('mcp:') && sources[key] === 'all').length;
	const mcpToolCount = Object.entries(sources)
		.filter(([key, value]) => key.startsWith('mcp:') && value !== 'all')
		.reduce((sum, [, value]) => sum + (Array.isArray(value) ? value.length : 0), 0);
	return [
		builtInCount > 0 ? t('settings.agents.tools.builtIn', { count: builtInCount }) : '',
		mcpServerCount > 0 ? t('settings.agents.tools.mcpServer', { count: mcpServerCount }) : '',
		mcpToolCount > 0 ? t('settings.agents.tools.mcpTool', { count: mcpToolCount }) : '',
	].filter(Boolean);
}
