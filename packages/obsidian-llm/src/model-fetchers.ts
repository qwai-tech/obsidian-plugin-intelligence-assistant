import type { ModelCapability, ModelInfo } from './types';
import { getDefaultHttpPort } from './http';
import { DEFAULT_MODELS, inferOpenAICapabilities, inferGoogleCapabilities, inferDeepSeekCapabilities } from './model-catalog';

export async function fetchOpenAIModels(apiKey: string, baseUrl?: string, providerId: 'openai' | 'custom' = 'openai'): Promise<ModelInfo[]> {
	const url = baseUrl
		? `${baseUrl.replace(/\/$/, '')}/models`
		: 'https://api.openai.com/v1/models';

	const response = await getDefaultHttpPort().request({
		url,
		method: 'GET',
		headers: {
			'Authorization': `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
	});

	if (response.status !== 200) {
		throw new Error(`Failed to fetch models: ${response.status}`);
	}

	const data = response.json as { data: Array<{ id: string; [key: string]: unknown }> };
	return data.data
		.filter((model: { id: string }) => !isOfficialOpenAI(baseUrl) || isOpenAIChatOrEmbedding(model.id))
		.map((model: { id: string }) => {
			const prefixedId = `${providerId}:${model.id}`;
			const defaultModel = DEFAULT_MODELS.openai.find(m => m.id === `openai:${model.id}`);
			const capabilities = defaultModel?.capabilities || inferOpenAICapabilities(model.id);

			return {
				id: prefixedId,
				name: model.id,
				provider: providerId,
				capabilities: capabilities,
				enabled: true
			};
		})
		.sort((a: ModelInfo, b: ModelInfo) => a.name.localeCompare(b.name));
}

export async function fetchGoogleModels(apiKey: string, baseUrl?: string): Promise<ModelInfo[]> {
	const url = baseUrl
		? `${baseUrl.replace(/\/$/, '')}/models`
		: 'https://generativelanguage.googleapis.com/v1beta/models';

	const response = await getDefaultHttpPort().request({ url, method: 'GET', headers: { 'x-goog-api-key': apiKey } });

	if (response.status !== 200) {
		throw new Error(`Failed to fetch models: ${response.status}`);
	}

	const data = response.json as {
		models: Array<{
			name: string;
			displayName?: string;
			supportedGenerationMethods?: string[];
		}>;
	};
	return data.models
		.filter((model: { supportedGenerationMethods?: string[] }) => model.supportedGenerationMethods?.includes('generateContent'))
		.map((model: { name: string; displayName?: string }) => {
			const modelId = model.name.replace('models/', '');
			const prefixedId = `google:${modelId}`;
			const defaultModel = DEFAULT_MODELS.google.find(m => m.id === prefixedId);
			const capabilities = defaultModel?.capabilities || inferGoogleCapabilities(modelId);

			return {
				id: prefixedId,
				name: model.displayName || modelId,
				provider: 'google',
				capabilities: capabilities,
				enabled: true
			};
		})
		.sort((a: ModelInfo, b: ModelInfo) => a.name.localeCompare(b.name));
}

export async function fetchDeepSeekModels(apiKey: string, baseUrl?: string): Promise<ModelInfo[]> {
	const url = baseUrl
		? `${baseUrl.replace(/\/$/, '')}/models`
		: 'https://api.deepseek.com/v1/models';

	const response = await getDefaultHttpPort().request({
		url,
		method: 'GET',
		headers: {
			'Authorization': `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
	});

	if (response.status !== 200) {
		throw new Error(`Failed to fetch models: ${response.status}`);
	}

	const data = response.json as { data: Array<{ id: string; [key: string]: unknown }> };
	return data.data
		.map((model: { id: string }) => {
			const prefixedId = `deepseek:${model.id}`;
			const defaultModel = DEFAULT_MODELS.deepseek.find(m => m.id === prefixedId);
			const capabilities = defaultModel?.capabilities || inferDeepSeekCapabilities(model.id);

			return {
				id: prefixedId,
				name: model.id,
				provider: 'deepseek',
				capabilities: capabilities,
				enabled: true
			};
		})
		.sort((a: ModelInfo, b: ModelInfo) => a.name.localeCompare(b.name));
}

export async function fetchOpenRouterModels(apiKey: string, baseUrl?: string): Promise<ModelInfo[]> {
	const url = baseUrl
		? `${baseUrl.replace(/\/$/, '')}/models`
		: 'https://openrouter.ai/api/v1/models';

	const response = await getDefaultHttpPort().request({
		url,
		method: 'GET',
		headers: {
			'Authorization': `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://obsidian.md',
			'X-Title': 'Obsidian Intelligence Assistant',
		},
	});

	if (response.status !== 200) {
		throw new Error(`Failed to fetch models: ${response.status}`);
	}

	const data = response.json as {
		data: Array<{
			id: string;
			name?: string;
			architecture?: {
				input_modalities?: string[];
				modality?: string;
			};
			supported_parameters?: string[];
		}>;
	};
	return data.data
		.map((model: {
			id: string;
			name?: string;
			architecture?: {
				input_modalities?: string[];
				modality?: string;
			};
			supported_parameters?: string[];
		}) => {
			const capabilities: ModelCapability[] = ['chat']; // All models support chat
			if (model.architecture?.input_modalities) {
				const inputModalities = model.architecture.input_modalities;
				if (inputModalities.includes('image')) capabilities.push('vision');
				if (inputModalities.includes('audio')) capabilities.push('audio');
				if (inputModalities.includes('video')) capabilities.push('video');
			}
			if (model.architecture?.modality?.includes('image')) {
				if (!capabilities.includes('vision')) capabilities.push('vision');
			}
			if (model.supported_parameters) {
				const params = model.supported_parameters;
				if (params.includes('tools') || params.includes('tool_choice')) {
					capabilities.push('function_calling');
				}
				if (params.includes('response_format') || params.includes('structured_outputs')) {
					capabilities.push('json_mode');
				}
				if (params.includes('reasoning') || params.includes('include_reasoning')) {
					capabilities.push('reasoning');
				}
			}
			capabilities.push('streaming');

			const prefixedId = `openrouter:${model.id}`;
				if (model.id.includes('embedding') || model.architecture?.modality === 'text->embedding') {
					const embeddingCapabilities: ModelCapability[] = ['embedding'];
					return {
						id: prefixedId,
						name: model.name || model.id,
						provider: 'openrouter',
						capabilities: embeddingCapabilities,
						enabled: true
					};
				}

			return {
				id: prefixedId,
				name: model.name || model.id,
				provider: 'openrouter',
				capabilities: capabilities,
				enabled: true
			};
		})
		.sort((a: ModelInfo, b: ModelInfo) => a.name.localeCompare(b.name));
}

function isOfficialOpenAI(baseUrl?: string): boolean {
	return !baseUrl || /^https:\/\/api\.openai\.com(\/|$)/.test(baseUrl);
}

function isOpenAIChatOrEmbedding(id: string): boolean {
	return id.startsWith('gpt') || id.startsWith('o1') || id.startsWith('o3') || id.includes('embedding');
}

export async function fetchAnthropicModels(apiKey: string, baseUrl = 'https://api.anthropic.com/v1'): Promise<ModelInfo[]> {
	const response = await getDefaultHttpPort().request({ url: `${baseUrl.replace(/\/$/, '')}/models`, method: 'GET', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } });
	if (!response.ok) throw new Error(`Anthropic model discovery failed: HTTP ${response.status}`);
	const data = response.json as { data?: Array<{ id: string; display_name?: string }> };
	if (!Array.isArray(data.data)) throw new Error('Anthropic model discovery returned no model list');
	return data.data.map(model => ({ id: `anthropic:${model.id}`, name: model.display_name ?? model.id, provider: 'anthropic', enabled: true, capabilities: ['chat', 'streaming', 'vision', 'function_calling'] }));
}
