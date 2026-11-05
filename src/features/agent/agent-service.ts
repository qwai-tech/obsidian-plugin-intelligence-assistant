/**
 * Agent Service
 * Manages agent initialization and configuration
 */

import type { PluginSettings } from '@/features/settings';
import type { AgentToolAccess } from '@/features/tools';
import {
	DEFAULT_AGENT_ID,
	DEFAULT_MODEL_CONFIG,
	DEFAULT_MEMORY_CONFIG,
	DEFAULT_MAX_STEPS
} from '@/core/constants';
import { BUILTIN_AGENT_PRESETS } from '@/features/agent/presets/builtin-agents';
import { BUILTIN_PROMPT_PRESETS } from '@/features/agent/presets/builtin-prompts';


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
export function ensureDefaultAgent(settings: PluginSettings): void {
	const assistantPromptId = 'builtin-intelligence-assistant';


	// Phase F: Ensure all builtin prompts are present and up-to-date (readonly)
	for (const preset of BUILTIN_PROMPT_PRESETS) {
		const existing = settings.systemPrompts.find(p => p.id === preset.id);
		if (!existing) {
			settings.systemPrompts.push({ ...preset });
		} else if (preset.readonly) {
			// Force update content and metadata for readonly builtins
			if (existing.content !== preset.content || existing.name !== preset.name || !existing.readonly) {
				existing.content = preset.content;
				existing.name = preset.name;
				existing.readonly = true;
				existing.updatedAt = Date.now();
			}
		}
	}

	// Also force-update the legacy 'default' prompt if it exists and is old
	const legacyPrompt = settings.systemPrompts.find(p => p.id === 'default');
	if (legacyPrompt && legacyPrompt.content.includes('helpful AI assistant')) {
		const assistantPreset = BUILTIN_PROMPT_PRESETS.find(p => p.id === 'builtin-intelligence-assistant')!;
		legacyPrompt.content = assistantPreset.content;
		legacyPrompt.name = 'Default assistant (optimized)';
	}

	const enabledBuiltInTools = settings.builtInTools
		.filter(tool => tool.enabled)
		.map(tool => tool.type);

	const defaultPromptId = settings.systemPrompts.find(prompt => prompt.id === 'default' && prompt.enabled)?.id
		|| settings.systemPrompts[0]?.id
		|| 'default';

	const fallbackModel = settings.defaultModel?.trim()
		|| settings.llmConfigs.flatMap(config => config.cachedModels ?? [])
			.find(model => model.capabilities?.includes('chat'))?.id
		|| DEFAULT_MODEL_CONFIG.FALLBACK_MODEL;

	let defaultAgent = settings.agents.find(agent => agent.id === DEFAULT_AGENT_ID);

	if (defaultAgent) {
		// Force update existing default agent to use the new optimized prompt and settings
		if (defaultAgent.systemPromptId !== assistantPromptId) {
			defaultAgent.systemPromptId = assistantPromptId;
		}
		const newDesc = 'Advanced Obsidian agent specializing in multi-step vault operations, spatial thinking, and long-term knowledge management.';
		if (defaultAgent.description !== newDesc) {
			defaultAgent.description = newDesc;
		}
	}

	if (settings.agents.length === 0 || !settings.agents.some(a => a.id === DEFAULT_AGENT_ID)) {
		const timestamp = Date.now();

		defaultAgent = {
			id: DEFAULT_AGENT_ID,
			name: 'Intelligence Assistant',
			description: 'Advanced Obsidian agent specializing in multi-step vault operations, spatial thinking, and long-term knowledge management.',
			icon: 'sparkles',
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
	}

	// Ensure all builtin expert agents are present
	for (const preset of BUILTIN_AGENT_PRESETS) {
		if (!settings.agents.some(a => a.id === preset.id)) {
			settings.agents.push({ ...preset });
		}
	}

	const ensuredAgent = defaultAgent ?? settings.agents.find(a => a.id === DEFAULT_AGENT_ID)!;

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
		}
	}

	if (!settings.systemPrompts.some(prompt => prompt.id === ensuredAgent.systemPromptId)) {
		ensuredAgent.systemPromptId = defaultPromptId;
	}

	if (!settings.activeAgentId) {
		settings.activeAgentId = ensuredAgent.id;
	}
}
