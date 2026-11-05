import { ModelManager, connectionLabel, type LLMConfig } from '@qwai/obsidian-llm';
import { t } from '@/i18n';
import { getProviderMeta } from '@/ui/provider-meta';

export function modelDisplayLabel(id: string, configs: LLMConfig[]): string {
	const config = ModelManager.findConfigForModelByProvider(id, configs);
	const separator = id.indexOf(':');
	const name = config?.cachedModels?.find(model => model.id === id)?.name || (separator < 0 ? id : id.slice(separator + 1));
	if (config) return `${name} · ${connectionLabel(config)}`;
	if (id.startsWith('custom@')) return `${name} · ${t('ux.unavailableConnection')}`;
	return separator < 0 ? name : `${name} · ${getProviderMeta(id.slice(0, separator)).label}`;
}
