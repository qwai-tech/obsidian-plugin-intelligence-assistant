import type IntelligenceAssistantPlugin from '@plugin';
import { ModelManager } from '@/infrastructure/llm/model-manager';
import type { Message } from '@/types';

export function resolveMessageProviderId(
	message: Message,
	plugin: IntelligenceAssistantPlugin
): string | null {
	const metadata = message as Record<string, any>;
	const explicitProvider = typeof metadata.provider === 'string'
		? metadata.provider
		: (typeof metadata.modelProvider === 'string' ? metadata.modelProvider : null);

	if (explicitProvider && explicitProvider.trim().length > 0) {
		return explicitProvider.trim().toLowerCase();
	}

	const rawModelId = typeof message.model === 'string' && message.model.trim().length > 0
		? message.model
		: (typeof metadata.model === 'string' ? metadata.model : null);

	if (rawModelId) {
		const config = ModelManager.findConfigForModelByProvider(rawModelId, plugin.settings.llmConfigs);
		if (config?.provider) {
			return config.provider.toLowerCase();
		}

		const inferred = ModelManager.getProviderFromModelId(rawModelId);
		if (inferred) {
			return inferred.toLowerCase();
		}

		if (rawModelId.includes(':')) {
			return rawModelId.split(':')[0].toLowerCase();
		}
	}

	return null;
}

export function getModelDisplayName(modelId?: string | null): string | null {
	if (!modelId || modelId.trim().length === 0) {
		return null;
	}

	const trimmed = modelId.trim();
	if (!trimmed.includes(':')) {
		return trimmed;
	}

	const [, modelName] = trimmed.split(/:(.+)/); // Preserve anything after the first colon
	return modelName || trimmed;
}
