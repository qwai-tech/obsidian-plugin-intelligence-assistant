import type { Agent } from '@/features/agent';
import type { PluginSettings } from '@/features/settings/types/settings';
import { migrateAllAgents } from '@/features/tools';
import { DEFAULT_MAX_STEPS, DEFAULT_MODEL_CONFIG } from '@/core/constants';
import { retagCustomProviderModels } from './model-identity-migration';

type LegacyAgent = Agent & { modelId?: unknown; reactMaxSteps?: unknown; reactEnabled?: unknown; reactAutoContinue?: unknown };

export function migrateSettings(settings: PluginSettings): boolean {
	const strategyChanged = settings.agents.filter((agent) => migrateModelStrategy(agent, settings.defaultModel)).length > 0;
	const stepsChanged = settings.agents.filter(migrateStepBudget).length > 0;
	const cliToolIds = (settings.cliTools ?? []).map((tool) => tool.id);
	const toolAccessChanged = migrateAllAgents(settings.agents, cliToolIds).size > 0;
	const titleModeRenamed = renameTitleMode(settings);
	const connectionModesFixed = lowercaseConnectionModes(settings);
	const presetsRenamed = renameBuiltinPresets(settings);
	const searchProviderMoved = retireSearchProviders(settings);
	const customModelsRetagged = retagCustomProviderModels(settings);
	return strategyChanged || stepsChanged || toolAccessChanged || titleModeRenamed || connectionModesFixed || presetsRenamed || searchProviderMoved || customModelsRetagged;
}


const RETIRED_SEARCH_PROVIDERS = new Set(['duckduckgo', 'yahoo', 'yandex']);

function retireSearchProviders(settings: PluginSettings): boolean {
	if (!RETIRED_SEARCH_PROVIDERS.has(settings.webSearchConfig.provider)) return false;
	settings.webSearchConfig.provider = 'searxng';
	return true;
}

const OLD_PRESET_NAMES: Record<string, string> = {
	'✨ Intelligence Assistant Core': 'Intelligence Assistant Core',
	'🔍 Librarian System Prompt': 'Librarian system prompt',
	'🏗️ Architect System Prompt': 'Architect system prompt',
	'🧬 Researcher System Prompt': 'Researcher system prompt',
	'🖋️ Scribe System Prompt': 'Scribe system prompt',
	'🔍 Librarian (知识矿工)': 'Librarian',
	'🏗️ Architect (白板建筑师)': 'Architect',
	'🧬 Researcher (深度研究员)': 'Researcher',
	'🖋️ Scribe (创作伙伴)': 'Scribe',
};

function renameBuiltinPresets(settings: PluginSettings): boolean {
	let changed = false;
	for (const preset of [...settings.agents, ...settings.systemPrompts]) {
		const renamed = OLD_PRESET_NAMES[preset.name];
		if (renamed) {
			preset.name = renamed;
			changed = true;
		}
	}
	for (const agent of settings.agents) {
		if (agent.icon === '✨') {
			agent.icon = 'sparkles';
			changed = true;
		}
	}
	return changed;
}

function lowercaseConnectionModes(settings: PluginSettings): boolean {
	let changed = false;
	for (const server of settings.mcpServers) {
		const mode = server.connectionMode?.toLowerCase();
		if (mode && mode !== server.connectionMode && (mode === 'auto' || mode === 'manual')) {
			server.connectionMode = mode;
			changed = true;
		}
	}
	return changed;
}

function renameTitleMode(settings: PluginSettings): boolean {
	if (settings.conversationTitleMode !== 'llm-summary') return false;
	settings.conversationTitleMode = 'auto-summary';
	return true;
}

function migrateStepBudget(agent: LegacyAgent): boolean {
	let changed = false;
	if (typeof agent.reactMaxSteps === 'number') {
		agent.maxSteps = agent.reactMaxSteps;
		changed = true;
	}
	for (const legacy of ['reactMaxSteps', 'reactEnabled', 'reactAutoContinue'] as const) {
		if (legacy in agent) {
			delete agent[legacy];
			changed = true;
		}
	}
	if (!agent.maxSteps || agent.maxSteps < 1) {
		agent.maxSteps = DEFAULT_MAX_STEPS;
		changed = true;
	}
	return changed;
}

function migrateModelStrategy(agent: LegacyAgent, defaultModel: string): boolean {
	if (typeof agent.modelId === 'string') {
		agent.modelStrategy = { strategy: 'fixed', modelId: agent.modelId };
		delete agent.modelId;
		return true;
	}
	if (!agent.modelStrategy) {
		agent.modelStrategy = { strategy: 'default', modelId: defaultModel || DEFAULT_MODEL_CONFIG.FALLBACK_MODEL };
		return true;
	}
	return false;
}
