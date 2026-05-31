/**
 * Agent Service
 * Manages agent initialization and configuration
 */

import type { PluginSettings } from '@/types';
import type { AgentToolAccess } from '@/types/common/tools';
import {
	DEFAULT_AGENT_ID,
	DEFAULT_MODEL_CONFIG,
	DEFAULT_MEMORY_CONFIG,
	DEFAULT_MAX_STEPS
} from '@/constants';
import { BUILTIN_AGENT_PRESETS } from '@/application/agents/presets/builtin-agents';
import { BUILTIN_PROMPT_PRESETS } from '@/application/agents/presets/builtin-prompts';

const LEGACY_DEFAULT_AGENT_MAX_TOKENS = 2000;

/** Build a toolAccess that grants the given builtin tool names. */
function builtinAccess(toolNames: string[]): AgentToolAccess {
	if (toolNames.length === 0) {
		return { sources: {} };
	}
	return {
		sources: {
			'builtin:builtin': toolNames.map((name) => `builtin:builtin:${name}`),
		},
	};
}

/**
 * Ensure the default agent exists and is properly configured
 * Creates the default agent if it doesn't exist and syncs enabled tools
 */
export async function ensureDefaultAgent(
	settings: PluginSettings,
	saveSettings: () => Promise<void>
): Promise<void> {
	let settingsDirty = false;
	const assistantPromptId = 'builtin-intelligence-assistant';

	// Phase E: Enforce Agent Mode for all users
	settings.defaultChatMode = 'agent';
	settingsDirty = true;

	// Phase F: Ensure all builtin prompts are present and up-to-date (readonly)
	for (const preset of BUILTIN_PROMPT_PRESETS) {
		const existing = settings.systemPrompts.find(p => p.id === preset.id);
		if (!existing) {
			settings.systemPrompts.push({ ...preset });
			settingsDirty = true;
		} else if (preset.readonly) {
			// Force update content and metadata for readonly builtins
			if (existing.content !== preset.content || existing.name !== preset.name || !existing.readonly) {
				existing.content = preset.content;
				existing.name = preset.name;
				existing.readonly = true;
				existing.updatedAt = Date.now();
				settingsDirty = true;
			}
		}
	}

	// Also force-update the legacy 'default' prompt if it exists and is old
	const legacyPrompt = settings.systemPrompts.find(p => p.id === 'default');
	if (legacyPrompt && legacyPrompt.content.includes('helpful AI assistant')) {
		const assistantPreset = BUILTIN_PROMPT_PRESETS.find(p => p.id === 'builtin-intelligence-assistant')!;
		legacyPrompt.content = assistantPreset.content;
		legacyPrompt.name = 'Default Assistant (Optimized)';
		settingsDirty = true;
	}

	// Ensure all agents have required fields and migrate legacy fields.
	// Per-source enable lists (enabledBuiltInTools etc.) are no longer touched
	// here — userConfigToPluginSettings already migrated them into toolAccess
	// at load time via migrateAllAgents. Defensive default for toolAccess in
	// case an agent landed here without going through that path.
	settings.agents.forEach(agent => {
		agent.toolAccess = agent.toolAccess ?? { sources: {} };
		const a = agent as unknown as Record<string, unknown>;
		if ('reactMaxSteps' in a && typeof a.reactMaxSteps === 'number') {
			agent.maxSteps = a.reactMaxSteps;
			delete a.reactMaxSteps;
		}
		if ('reactEnabled' in a) delete a.reactEnabled;
		if ('reactAutoContinue' in a) delete a.reactAutoContinue;
		if (!agent.maxSteps || agent.maxSteps < 1) agent.maxSteps = DEFAULT_MAX_STEPS;
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

	// Ensure all builtin prompts are present
	for (const prompt of BUILTIN_PROMPT_PRESETS) {
		if (!settings.systemPrompts.some(p => p.id === prompt.id)) {
			settings.systemPrompts.push({ ...prompt });
			settingsDirty = true;
		}
	}

	let defaultAgent = settings.agents.find(agent => agent.id === DEFAULT_AGENT_ID);

	if (defaultAgent) {
		// Force update existing default agent to use the new optimized prompt and settings
		if (defaultAgent.systemPromptId !== assistantPromptId) {
			defaultAgent.systemPromptId = assistantPromptId;
			settingsDirty = true;
		}
		if (defaultAgent.temperature !== 0.5) {
			defaultAgent.temperature = 0.5;
			settingsDirty = true;
		}
		const newDesc = 'Advanced Obsidian Agent specializing in multi-step vault operations, spatial thinking, and long-term knowledge management.';
		if (defaultAgent.description !== newDesc) {
			defaultAgent.description = newDesc;
			settingsDirty = true;
		}
	}

	if (settings.agents.length === 0 || !settings.agents.some(a => a.id === DEFAULT_AGENT_ID)) {
		const timestamp = Date.now();

		defaultAgent = {
			id: DEFAULT_AGENT_ID,
			name: 'Intelligence Assistant',
			description: 'Advanced Obsidian Agent specializing in multi-step vault operations, spatial thinking, and long-term knowledge management.',
			icon: '✨',
			modelStrategy: {
				strategy: 'default',
				modelId: fallbackModel
			},
			temperature: 0.5,
			maxTokens: DEFAULT_MODEL_CONFIG.MAX_TOKENS,
			systemPromptId: assistantPromptId,
			contextWindow: DEFAULT_MODEL_CONFIG.CONTEXT_WINDOW,
			toolAccess: builtinAccess(enabledBuiltInTools),
			memoryType: 'none',
			memoryConfig: {
				summaryInterval: DEFAULT_MEMORY_CONFIG.SUMMARY_INTERVAL,
				maxMemories: DEFAULT_MEMORY_CONFIG.MAX_MEMORIES
			},
			ragEnabled: settings.ragConfig.enabled,
			webSearchEnabled: settings.webSearchConfig.enabled,
			maxSteps: DEFAULT_MAX_STEPS,
			createdAt: timestamp,
			updatedAt: timestamp
		};
		settings.agents.unshift(defaultAgent);
		settingsDirty = true;
	}

	// Ensure all builtin expert agents are present
	for (const preset of BUILTIN_AGENT_PRESETS) {
		if (!settings.agents.some(a => a.id === preset.id)) {
			settings.agents.push({ ...preset });
			settingsDirty = true;
		}
	}

	const ensuredAgent = defaultAgent ?? settings.agents.find(a => a.id === DEFAULT_AGENT_ID)!;
	ensuredAgent.toolAccess = ensuredAgent.toolAccess ?? { sources: {} };

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

	if (ensuredAgent.maxTokens === LEGACY_DEFAULT_AGENT_MAX_TOKENS) {
		ensuredAgent.maxTokens = DEFAULT_MODEL_CONFIG.MAX_TOKENS;
		ensuredAgent.updatedAt = Date.now();
		settingsDirty = true;
	}

	// Sync the default agent's builtin tool access to whatever is globally
	// enabled in settings.builtInTools. Compare against the current toolAccess
	// builtin entry; rewrite only when it actually diverges.
	const currentBuiltinIds = (() => {
		const rule = ensuredAgent.toolAccess.sources['builtin:builtin'];
		if (rule === 'all') return null; // 'all' is a different intent — leave it.
		return rule ?? [];
	})();
	if (currentBuiltinIds !== null) {
		const desiredIds = enabledBuiltInTools.map((name) => `builtin:builtin:${name}`);
		const equal = currentBuiltinIds.length === desiredIds.length
			&& desiredIds.every((id) => currentBuiltinIds.includes(id));
		if (!equal) {
			ensuredAgent.toolAccess = {
				...ensuredAgent.toolAccess,
				sources: {
					...ensuredAgent.toolAccess.sources,
					...(desiredIds.length > 0 ? { 'builtin:builtin': desiredIds } : {}),
				},
			};
			if (desiredIds.length === 0) {
				delete ensuredAgent.toolAccess.sources['builtin:builtin'];
			}
			ensuredAgent.updatedAt = Date.now();
			settingsDirty = true;
		}
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
