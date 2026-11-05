import type { PluginSettings } from './types/settings';
import { ensureConnectionId, scopeModel } from '../../../packages/obsidian-llm/src/model-identity';

export function retagCustomProviderModels(settings: PluginSettings): boolean {
	const renamed = new Map<string, string>();
	let changed = false;
	for (const config of settings.llmConfigs.filter(candidate => candidate.provider === 'custom')) {
		if (!config.id) changed = true;
		const connectionId = ensureConnectionId(config);
		for (const model of config.cachedModels ?? []) {
			const scoped = scopeModel(model, config);
			if (model.id !== scoped.id) {
				// Legacy IDs selected the first matching connection. Preserve that
				// affinity during migration instead of switching to the last one.
				if (!renamed.has(model.id)) renamed.set(model.id, scoped.id);
				changed = true;
			}
			Object.assign(model, scoped);
		}
		config.disabledModels = config.disabledModels?.map(id => {
			const end = id.indexOf(':');
			const next = end < 0 ? id : `custom@${connectionId}:${id.slice(end + 1)}`;
			if (next !== id) changed = true;
			return next;
		});
	}
	if (!changed) return false;
	const openAiIds = new Set(settings.llmConfigs.filter(config => config.provider === 'openai').flatMap(config => (config.cachedModels ?? []).map(model => model.id)));
	const retag = (id: string | undefined): string | undefined => (id && !openAiIds.has(id) ? renamed.get(id) : undefined) ?? id;
	settings.defaultModel = retag(settings.defaultModel) ?? '';
	settings.titleSummaryModel = retag(settings.titleSummaryModel);
	settings.ragConfig.embeddingModel = retag(settings.ragConfig.embeddingModel) ?? settings.ragConfig.embeddingModel;
	settings.ragConfig.graderModel = retag(settings.ragConfig.graderModel);
	for (const agent of settings.agents) {
		if (agent.modelStrategy?.strategy === 'fixed') {
			agent.modelStrategy.modelId = retag(agent.modelStrategy.modelId);
		}
	}
	for (const action of settings.quickActions) {
		action.model = retag(action.model);
	}
	return true;
}
