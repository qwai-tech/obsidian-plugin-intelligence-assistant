/**
 * Agent Service
 * Manages agent initialization and configuration
 */

import type { PluginSettings } from '@/types';
import {
	DEFAULT_AGENT_ID,
	DEFAULT_MODEL_CONFIG,
	DEFAULT_MEMORY_CONFIG,
	DEFAULT_REACT_CONFIG
} from '@/constants';

/**
 * Ensure the default agent exists and is properly configured
 * Creates the default agent if it doesn't exist and syncs enabled tools
 */
export async function ensureDefaultAgent(
	settings: PluginSettings,
	saveSettings: () => Promise<void>
): Promise<void> {
	// Ensure all agents have MCP fields initialized
	settings.agents.forEach(agent => {
		agent.enabledMcpServers = agent.enabledMcpServers ?? [];
		agent.enabledMcpTools = agent.enabledMcpTools ?? [];
	});

	const enabledBuiltInTools = settings.builtInTools
		.filter(tool => tool.enabled)
		.map(tool => tool.type);

	const defaultPromptId = settings.systemPrompts.find(prompt => prompt.id === 'default' && prompt.enabled)?.id
		|| settings.systemPrompts[0]?.id
		|| 'default';

	const fallbackModel = settings.defaultModel?.trim()
		|| settings.llmConfigs.flatMap(config => config.cachedModels ?? [])
			.find(model => model.capabilities?.includes('chat'))?.id
		|| 'gpt-4o';

	let settingsDirty = false;
	let defaultAgent = settings.agents.find(agent => agent.id === DEFAULT_AGENT_ID);

	if (!defaultAgent) {
		const timestamp = Date.now();
		defaultAgent = {
			id: DEFAULT_AGENT_ID,
			name: 'Intelligence Assistant',
			description: 'General-purpose agent with built-in Obsidian tools.',
			icon: '✨',
			modelStrategy: {
				strategy: 'default',
				modelId: fallbackModel
			},
			temperature: DEFAULT_MODEL_CONFIG.TEMPERATURE,
			maxTokens: DEFAULT_MODEL_CONFIG.MAX_TOKENS,
			systemPromptId: defaultPromptId,
			contextWindow: DEFAULT_MODEL_CONFIG.CONTEXT_WINDOW,
			enabledBuiltInTools: [...enabledBuiltInTools],
			enabledMcpServers: [],
			enabledMcpTools: [],
			memoryType: 'none',
			memoryConfig: {
				summaryInterval: DEFAULT_MEMORY_CONFIG.SUMMARY_INTERVAL,
				maxMemories: DEFAULT_MEMORY_CONFIG.MAX_MEMORIES
			},
			ragEnabled: settings.ragConfig.enabled,
			webSearchEnabled: settings.webSearchConfig.enabled,
			reactEnabled: false,
			reactMaxSteps: DEFAULT_REACT_CONFIG.MAX_STEPS,
			reactAutoContinue: DEFAULT_REACT_CONFIG.AUTO_CONTINUE,
			createdAt: timestamp,
			updatedAt: timestamp
		};
		settings.agents.unshift(defaultAgent);
		settingsDirty = true;
	}

	const ensuredAgent = defaultAgent;
	ensuredAgent.enabledMcpServers = ensuredAgent.enabledMcpServers ?? [];
	ensuredAgent.enabledMcpTools = ensuredAgent.enabledMcpTools ?? [];

	// Migrate old agents that still have modelId to use new modelStrategy
	if ('modelId' in ensuredAgent && typeof (ensuredAgent as Record<string, unknown>).modelId === 'string') {
		const modelId = (ensuredAgent as Record<string, unknown>).modelId as string;
		// Convert the old modelId to the new modelStrategy format
		ensuredAgent.modelStrategy = {
			strategy: 'fixed',
			modelId: modelId
		};
		// Remove the old field
		delete (ensuredAgent as Record<string, unknown>).modelId;
		settingsDirty = true;
	}

	// Ensure modelStrategy exists for all agents
	if (!ensuredAgent.modelStrategy) {
		ensuredAgent.modelStrategy = {
			strategy: 'default',
			modelId: fallbackModel
		};
		settingsDirty = true;
	}

	if (ensuredAgent.enabledBuiltInTools.length !== enabledBuiltInTools.length || !enabledBuiltInTools.every(tool => ensuredAgent.enabledBuiltInTools.includes(tool))) {
		ensuredAgent.enabledBuiltInTools = [...enabledBuiltInTools];
		ensuredAgent.updatedAt = Date.now();
		settingsDirty = true;
	}

	if (!settings.systemPrompts.some(prompt => prompt.id === ensuredAgent.systemPromptId)) {
		ensuredAgent.systemPromptId = defaultPromptId;
		settingsDirty = true;
	}

	if (!settings.activeAgentId) {
		settings.activeAgentId = ensuredAgent.id;
		settingsDirty = true;
	}

	if (settingsDirty) {
		await saveSettings();
	}
}
