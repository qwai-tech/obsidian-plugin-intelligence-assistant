/**
 * Agents Settings Tab
 * Displays agent management and configuration
 */

import { App } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import type { Agent, ModelInfo } from '@/types';
import { createTable } from '@/presentation/utils/ui-helpers';
import { AgentEditModal } from '../modals';
import { DEFAULT_AGENT_ID } from '@/constants';

export function displayAgentsTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	app: App,
	refreshDisplay: () => void
): void {
	containerEl.createEl('h3', { text: 'Agent Management' });

	const desc = containerEl.createEl('p', {
		text: 'Create and manage AI agents with specific capabilities, tools, and behaviors.'
	});
	desc.addClass('ia-section-description');

	// Add new agent button
	const actionsRow = containerEl.createDiv('ia-section-actions');
	const agentSummary = actionsRow.createDiv('ia-section-summary');
	agentSummary.createSpan({ text: `${plugin.settings.agents.length} agent${plugin.settings.agents.length === 1 ? '' : 's'} configured` });

	const addBtn = actionsRow.createEl('button', { text: '+ Add Agent' });
	addBtn.addClass('ia-button');
	addBtn.addClass('ia-button--primary');
	addBtn.addEventListener('click', () => {
		const enabledTools = plugin.settings.builtInTools
			.filter(tool => tool.enabled)
			.map(tool => tool.type);
		const newAgent: Agent = {
			id: `agent-${Date.now()}`,
			name: 'New Agent',
			description: 'A helpful AI assistant',
			icon: '🤖',
			modelStrategy: {
				strategy: 'default',
				modelId: plugin.settings.defaultModel || 'gpt-4o'
			},
			temperature: 0.7,
			maxTokens: 2000,
			systemPromptId: plugin.settings.systemPrompts[0]?.id || 'default',
			contextWindow: 20,
			enabledBuiltInTools: [...enabledTools],
			enabledMcpServers: [],
			enabledMcpTools: [],
			memoryType: 'none',
			memoryConfig: {
				summaryInterval: 10,
				maxMemories: 50
			},
			ragEnabled: false,
			webSearchEnabled: false,
			reactEnabled: false,
			reactMaxSteps: 10,
			reactAutoContinue: true,
			createdAt: Date.now(),
			updatedAt: Date.now()
		};
		plugin.settings.agents.push(newAgent);
		plugin.saveSettings();
		refreshDisplay();
	});

	// Display existing agents in a table if they exist
	if (plugin.settings.agents.length === 0) {
		const emptyDiv = containerEl.createDiv('ia-empty-state');
		emptyDiv.setText('No agents configured. Click "Add Agent" to get started.');
		return;
	}

	const table = createTable(containerEl, ['Agent', 'Model', 'Capabilities', 'Tools', 'Actions']);
	const tbody = table.tBodies[0];

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

	const formatLabel = (value: string): string => value.split(/[-_]/g).map(word => {
		if (!word) return word;
		if (word.length <= 2) return word.toUpperCase();
		return word.charAt(0).toUpperCase() + word.slice(1);
	}).join(' ');

	const agents = [...plugin.settings.agents].sort((a, b) => {
		const aDefault = a.id === DEFAULT_AGENT_ID;
		const bDefault = b.id === DEFAULT_AGENT_ID;
		if (aDefault && !bDefault) return -1;
		if (!aDefault && bDefault) return 1;
		return a.name.localeCompare(b.name);
	});

	agents.forEach(agent => {
		agent.enabledMcpServers = agent.enabledMcpServers ?? [];
		agent.enabledMcpTools = agent.enabledMcpTools ?? [];
		const row = tbody.insertRow();
		row.addClass('ia-table-row');

		// Agent column
		const agentCell = row.insertCell();
		agentCell.addClass('ia-table-cell');
		const agentStack = agentCell.createDiv('ia-table-stack');
		const titleEl = agentStack.createDiv('ia-table-title');
		const iconSpan = titleEl.createSpan();
		iconSpan.addClass('ia-agent-icon');
		iconSpan.setText(agent.icon || '🤖');
		iconSpan.style.marginRight = '6px';
		titleEl.appendChild(document.createTextNode(agent.name));

		if (agent.id === DEFAULT_AGENT_ID) {
			const badges = agentStack.createDiv('ia-table-badges');
			const tag = badges.createEl('span', { text: 'Default' });
			tag.addClass('ia-tag');
		}

		if (agent.description) {
			agentStack.createDiv('ia-table-subtext').setText(agent.description);
		}

		const promptName = promptMap.get(agent.systemPromptId)?.name || 'Custom prompt';
		agentStack.createDiv('ia-table-subtext').setText(`System prompt • ${promptName}`);

		// Model column
		const modelCell = row.insertCell();
		modelCell.addClass('ia-table-cell');
		const modelStack = modelCell.createDiv('ia-table-stack');
		
		// Determine what to display based on the model strategy
		let displayModel = 'Not set';
		let displaySubtext = 'Model not found in cache';
		
		if (agent.modelStrategy.strategy === 'fixed' && agent.modelStrategy.modelId) {
			const modelInfo = modelLookup.get(agent.modelStrategy.modelId) || null;
			displayModel = modelInfo?.name || agent.modelStrategy.modelId;
			if (modelInfo) {
				displaySubtext = `${formatLabel(modelInfo.provider)} • ${modelInfo.id}`;
			} else {
				displaySubtext = 'Model not found in cache';
			}
		} else if (agent.modelStrategy.strategy === 'chat-view') {
			displayModel = 'Use Chat View Model';
			displaySubtext = 'Will use model selected in chat view';
		} else if (agent.modelStrategy.strategy === 'default') {
			displayModel = 'Use Default Model';
			displaySubtext = 'Will use default model from settings';
		}

		const modelTitle = modelStack.createDiv('ia-table-title');
		modelTitle.setText(displayModel);
		modelStack.createDiv('ia-table-subtext').setText(displaySubtext);

		// Capabilities column
		const capsCell = row.insertCell();
		capsCell.addClass('ia-table-cell');
		const capsDiv = capsCell.createDiv('ia-table-badges');
		const addCapability = (label: string) => {
			const badge = capsDiv.createEl('span', { text: label });
			badge.addClass('ia-tag');
		};

		if (agent.ragEnabled) addCapability('RAG');
		if (agent.webSearchEnabled) addCapability('Web');
		if (agent.reactEnabled) addCapability('ReAct');

		if (capsDiv.childElementCount === 0) {
			capsCell.createDiv('ia-table-subtext').setText('No special modes');
		}

		// Tools column
		const toolsCell = row.insertCell();
		toolsCell.addClass('ia-table-cell');
		const toolsBadges = toolsCell.createDiv('ia-table-badges');

		if (agent.enabledBuiltInTools.length > 0) {
			const builtInBadge = toolsBadges.createEl('span', { text: `${agent.enabledBuiltInTools.length} built-in` });
			builtInBadge.addClass('ia-tag');
		}

		const serverCount = agent.enabledMcpServers.length;
		const toolCount = agent.enabledMcpTools.length;
		if (serverCount > 0) {
			const mcpBadge = toolsBadges.createEl('span', { text: `${serverCount} MCP server${serverCount === 1 ? '' : 's'}` });
			mcpBadge.addClass('ia-tag');
		}
		if (toolCount > 0) {
			const toolBadge = toolsBadges.createEl('span', { text: `${toolCount} MCP tool${toolCount === 1 ? '' : 's'}` });
			toolBadge.addClass('ia-tag');
		}

		if (toolsBadges.childElementCount === 0) {
			toolsCell.createDiv('ia-table-subtext').setText('No tools enabled');
		}

		// Actions column
		const actionsCell = row.insertCell();
		actionsCell.addClass('ia-table-cell');
		actionsCell.addClass('ia-table-actions');

		const editBtn = actionsCell.createEl('button', { text: 'Edit' });
		editBtn.addClass('ia-button');
		editBtn.addClass('ia-button--ghost');
		editBtn.addEventListener('click', () => {
			new AgentEditModal(app, plugin, agent, async (updatedAgent) => {
				const agentIndex = plugin.settings.agents.findIndex(a => a.id === updatedAgent.id);
				if (agentIndex !== -1) {
					plugin.settings.agents[agentIndex] = updatedAgent;
					await plugin.saveSettings();
					refreshDisplay();
				}
			}).open();
		});

		const canDelete = agent.id !== DEFAULT_AGENT_ID && plugin.settings.agents.length > 1;
		const deleteBtn = actionsCell.createEl('button', { text: canDelete ? 'Delete' : 'Protected' });
		deleteBtn.addClass('ia-button');
		deleteBtn.addClass('ia-button--danger');
		if (!canDelete) {
			deleteBtn.setAttr('disabled', 'true');
		} else {
			deleteBtn.addEventListener('click', async () => {
				if (confirm(`Delete agent "${agent.name}"?`)) {
					const agentIndex = plugin.settings.agents.findIndex(a => a.id === agent.id);
					if (agentIndex !== -1) {
						plugin.settings.agents.splice(agentIndex, 1);
						await plugin.saveSettings();
						refreshDisplay();
					}
				}
			});
		}
	});
}
