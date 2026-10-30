import type IntelligenceAssistantPlugin from '@plugin';
import { ModelManager } from '@qwai/obsidian-llm';
import type { Message } from '@/features/conversations';

export function resolveMessageProviderId(
	message: Message,
	plugin: IntelligenceAssistantPlugin
): string | null {
	const explicitProvider = message.provider?.trim();
	if (explicitProvider) {
		return explicitProvider.toLowerCase();
	}
	const modelId = message.model?.trim();
	if (!modelId) {
		return null;
	}
	const provider = ModelManager.findConfigForModelByProvider(modelId, plugin.settings.llmConfigs)?.provider
		|| ModelManager.getProviderFromModelId(modelId)
		|| (modelId.includes(':') ? modelId.split(':')[0] : null);
	return provider ? provider.toLowerCase() : null;
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
