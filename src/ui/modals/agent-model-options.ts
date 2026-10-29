import type { AgentModelStrategy } from '@/features/agent';
import type { LLMConfig } from '@/features/llm';

export interface ModelOption {
	id: string;
	label: string;
}

export interface ModelCatalog {
	options: ModelOption[];
	aliases: Map<string, string>;
}

export function modelCatalog(configs: LLMConfig[]): ModelCatalog {
	const options: ModelOption[] = [];
	const aliases = new Map<string, string>();
	const seen = new Set<string>();
	for (const config of configs) {
		for (const model of config.cachedModels ?? []) {
			if (!seen.has(model.id)) {
				seen.add(model.id);
				options.push({ id: model.id, label: `${model.name} • ${providerLabel(model.provider || config.provider)}` });
			}
			const alias = withoutProvider(model.id);
			if (alias !== model.id) {
				aliases.set(alias, model.id);
			}
		}
	}
	options.sort((a, b) => a.label.localeCompare(b.label));
	return { options, aliases };
}

export function initialModelSelection(catalog: ModelCatalog, strategy: AgentModelStrategy): string {
	const { options, aliases } = catalog;
	if (options.length === 0) {
		return strategy.modelId || '';
	}
	const has = (id: string | undefined) => Boolean(id) && options.some(option => option.id === id);
	if (strategy.strategy === 'fixed' && strategy.modelId) {
		if (has(strategy.modelId)) return strategy.modelId;
		const alias = aliases.get(strategy.modelId);
		if (alias && has(alias)) return alias;
	}
	return options[0].id;
}

export function uniquePromptId(name: string, existingIds: string[]): string {
	const slug = (name || 'agent-prompt').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
	const prefix = slug ? `agent-${slug}` : 'agent-prompt';
	const existing = new Set(existingIds);
	let candidate = prefix;
	for (let counter = 1; existing.has(candidate); counter++) {
		candidate = `${prefix}-${counter}`;
	}
	return candidate;
}

function withoutProvider(modelId: string): string {
	return modelId.includes(':') ? modelId.split(':').slice(1).join(':') : modelId;
}

function providerLabel(value: string): string {
	return value.split(/[-_]/g)
		.map(word => word.length <= 2 ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}
