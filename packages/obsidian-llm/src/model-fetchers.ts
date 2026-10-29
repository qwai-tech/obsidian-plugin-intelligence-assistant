import type { ModelCapability, ModelInfo } from './types';
import { getDefaultHttpPort } from './http';
import { reportDiagnostic } from './diagnostics';
import { DEFAULT_MODELS, inferOpenAICapabilities, inferGoogleCapabilities, inferDeepSeekCapabilities } from './model-catalog';

export async function fetchOpenAIModels(apiKey: string, baseUrl?: string): Promise<ModelInfo[]> {
	try {
		const url = baseUrl
			? `${baseUrl}/models`
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
			.filter((model: { id: string }) => model.id.startsWith('gpt') || model.id.startsWith('o1') || model.id.startsWith('o3') || model.id.includes('embedding'))
			.map((model: { id: string }) => {
				const prefixedId = `openai:${model.id}`;
				const defaultModel = DEFAULT_MODELS.openai.find(m => m.id === prefixedId);
				const capabilities = defaultModel?.capabilities || inferOpenAICapabilities(model.id);

				return {
					id: prefixedId,
					name: model.id,
					provider: 'openai',
					capabilities: capabilities,
					enabled: true
				};
			})
			.sort((a: ModelInfo, b: ModelInfo) => a.name.localeCompare(b.name));
	} catch (error) {
		console.error('Failed to fetch OpenAI models:', error);
		reportDiagnostic({ level: 'warn', message: 'Failed to fetch OpenAI models, using default list' });
		return DEFAULT_MODELS.openai;
	}
}

export async function fetchGoogleModels(apiKey: string, baseUrl?: string): Promise<ModelInfo[]> {
	try {
		const url = baseUrl
			? `${baseUrl}/models?key=${apiKey}`
			: `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

		const response = await getDefaultHttpPort().request({ url, method: 'GET' });

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
	} catch (error) {
		console.error('Failed to fetch Google models:', error);
		reportDiagnostic({ level: 'warn', message: 'Failed to fetch Google models, using default list' });
		return DEFAULT_MODELS.google;
	}
}

export async function fetchDeepSeekModels(apiKey: string, baseUrl?: string): Promise<ModelInfo[]> {
	try {
		const url = baseUrl
			? `${baseUrl}/models`
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
	} catch (error) {
		console.error('Failed to fetch DeepSeek models:', error);
		reportDiagnostic({ level: 'warn', message: 'Failed to fetch DeepSeek models, using default list' });
		return DEFAULT_MODELS.deepseek;
	}
}

export async function fetchOpenRouterModels(apiKey: string, baseUrl?: string): Promise<ModelInfo[]> {
	try {
		const url = baseUrl
			? `${baseUrl}/models`
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
	} catch (error) {
		console.error('Failed to fetch OpenRouter models:', error);
		reportDiagnostic({ level: 'warn', message: 'Failed to fetch OpenRouter models, using default list' });
		return DEFAULT_MODELS.openrouter;
	}
}
