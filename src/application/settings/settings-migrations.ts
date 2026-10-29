import type { Agent } from '@/types/core/agent';
import type { PluginSettings } from '@/types/settings';
import { migrateAllAgents } from '@/application/tools/tool-migrations';

type LegacyAgent = Agent & { modelId?: unknown };

export function migrateSettings(settings: PluginSettings): boolean {
	const strategyChanged = settings.agents.filter((agent) => migrateModelStrategy(agent, settings.defaultModel)).length > 0;
	const cliToolIds = (settings.cliTools ?? []).map((tool) => tool.id);
	const toolAccessChanged = migrateAllAgents(settings.agents, cliToolIds).size > 0;
	return strategyChanged || toolAccessChanged;
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
