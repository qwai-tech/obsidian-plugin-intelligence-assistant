import type { Agent } from '@/types/core/agent';
import type { PluginSettings } from '@/types/settings';
import { migrateAllAgents } from '@/application/tools/tool-migrations';

type LegacyAgent = Agent & { modelId?: unknown };

export function migrateSettings(settings: PluginSettings): boolean {
	const strategyChanged = settings.agents.filter((agent) => migrateModelStrategy(agent, settings.defaultModel)).length > 0;
	const cliToolIds = (settings.cliTools ?? []).map((tool) => tool.id);
	const toolAccessChanged = migrateAllAgents(settings.agents, cliToolIds).size > 0;
	const removedProviderDropped = dropRemovedProviders(settings);
	return strategyChanged || toolAccessChanged || removedProviderDropped;
}

const REMOVED_PROVIDERS = ['sap-ai-core'];

function dropRemovedProviders(settings: PluginSettings): boolean {
	const isRemovedModel = (modelId: string | undefined) => REMOVED_PROVIDERS.some(provider => modelId?.startsWith(`${provider}:`));
	let changed = false;
	const kept = settings.llmConfigs.filter(config => !REMOVED_PROVIDERS.includes(config.provider));
	if (kept.length !== settings.llmConfigs.length) {
		settings.llmConfigs = kept;
		changed = true;
	}
	if (isRemovedModel(settings.defaultModel)) {
		settings.defaultModel = '';
		changed = true;
	}
	for (const agent of settings.agents) {
		if (agent.modelStrategy?.strategy === 'fixed' && isRemovedModel(agent.modelStrategy.modelId)) {
			agent.modelStrategy = { strategy: 'default' };
			changed = true;
		}
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
		agent.modelStrategy = { strategy: 'default', modelId: defaultModel || 'gpt-4o' };
		return true;
	}
	return false;
}
