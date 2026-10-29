import type { ModelInfo, ModelCapability } from './types';

export const DEFAULT_MODELS: Record<string, ModelInfo[]> = {
	openai: [
		{ id: 'openai:o1', name: 'O1', provider: 'openai', capabilities: ['chat', 'reasoning', 'json_mode'], enabled: true },
		{ id: 'openai:o1-mini', name: 'O1 Mini', provider: 'openai', capabilities: ['chat', 'reasoning', 'json_mode'], enabled: true },
		{ id: 'openai:o3-mini', name: 'O3 Mini', provider: 'openai', capabilities: ['chat', 'reasoning', 'json_mode'], enabled: true },
		{ id: 'openai:gpt-5', name: 'GPT-5', provider: 'openai', capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'json_mode'], enabled: true },
		{ id: 'openai:gpt-5-mini', name: 'GPT-5 Mini', provider: 'openai', capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'json_mode'], enabled: true },
		{ id: 'openai:gpt-4o', name: 'GPT-4o', provider: 'openai', capabilities: ['chat', 'vision', 'audio', 'function_calling', 'streaming', 'json_mode'], enabled: true },
		{ id: 'openai:gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', capabilities: ['chat', 'vision', 'audio', 'function_calling', 'streaming', 'json_mode'], enabled: true },
		{ id: 'openai:gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'json_mode'], enabled: true },
		{ id: 'openai:gpt-4', name: 'GPT-4', provider: 'openai', capabilities: ['chat', 'function_calling', 'streaming', 'json_mode'], enabled: true },
		{ id: 'openai:gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai', capabilities: ['chat', 'function_calling', 'streaming', 'json_mode'], enabled: true },
		{ id: 'openai:text-embedding-3-large', name: 'Text Embedding 3 Large', provider: 'openai', capabilities: ['embedding'], enabled: true },
		{ id: 'openai:text-embedding-3-small', name: 'Text Embedding 3 Small', provider: 'openai', capabilities: ['embedding'], enabled: true },
	],
	anthropic: [
		{ id: 'anthropic:claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'json_mode', 'computer_use'], enabled: true },
		{ id: 'anthropic:claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'anthropic', capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'json_mode'], enabled: true },
		{ id: 'anthropic:claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'anthropic', capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'json_mode'], enabled: true },
		{ id: 'anthropic:claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', provider: 'anthropic', capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'json_mode'], enabled: true },
		{ id: 'anthropic:claude-3-haiku-20240307', name: 'Claude 3 Haiku', provider: 'anthropic', capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'json_mode'], enabled: true },
	],
	google: [
		{ id: 'google:gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Experimental)', provider: 'google', capabilities: ['chat', 'vision', 'audio', 'video', 'function_calling', 'streaming', 'json_mode', 'multimodal_output', 'code_execution'], enabled: true },
		{ id: 'google:gemini-2.0-flash-thinking-exp', name: 'Gemini 2.0 Flash Thinking (Experimental)', provider: 'google', capabilities: ['chat', 'vision', 'audio', 'video', 'function_calling', 'reasoning', 'streaming', 'json_mode', 'multimodal_output', 'code_execution'], enabled: true },
		{ id: 'google:gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google', capabilities: ['chat', 'vision', 'audio', 'video', 'function_calling', 'streaming', 'json_mode'], enabled: true },
		{ id: 'google:gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'google', capabilities: ['chat', 'vision', 'audio', 'video', 'function_calling', 'streaming', 'json_mode'], enabled: true },
		{ id: 'google:gemini-pro', name: 'Gemini Pro', provider: 'google', capabilities: ['chat', 'function_calling', 'streaming', 'json_mode'], enabled: true },
		{ id: 'google:text-embedding-004', name: 'Text Embedding 004', provider: 'google', capabilities: ['embedding'], enabled: true },
	],
	deepseek: [
		{ id: 'deepseek:deepseek-v4-pro', name: 'DeepSeek V4 Pro', provider: 'deepseek', capabilities: ['chat', 'function_calling', 'reasoning', 'streaming', 'json_mode'], enabled: true },
		{ id: 'deepseek:deepseek-v4-flash', name: 'DeepSeek V4 Flash', provider: 'deepseek', capabilities: ['chat', 'function_calling', 'streaming', 'json_mode'], enabled: true },
		{ id: 'deepseek:deepseek-chat', name: 'DeepSeek Chat (deprecated 2026-07-24)', provider: 'deepseek', capabilities: ['chat', 'function_calling', 'streaming', 'json_mode'], enabled: true },
		{ id: 'deepseek:deepseek-reasoner', name: 'DeepSeek Reasoner (deprecated 2026-07-24)', provider: 'deepseek', capabilities: ['chat', 'reasoning', 'streaming', 'json_mode'], enabled: true },
		{ id: 'deepseek:deepseek-coder', name: 'DeepSeek Coder', provider: 'deepseek', capabilities: ['chat', 'function_calling', 'streaming', 'json_mode'], enabled: true },
	],
	openrouter: [
		{ id: 'openrouter:openai/gpt-4o', name: 'GPT-4o', provider: 'openrouter', capabilities: ['chat', 'vision', 'audio', 'function_calling', 'streaming', 'json_mode'], enabled: true },
		{ id: 'openrouter:openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openrouter', capabilities: ['chat', 'vision', 'audio', 'function_calling', 'streaming', 'json_mode'], enabled: true },
		{ id: 'openrouter:anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'openrouter', capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'json_mode', 'computer_use'], enabled: true },
		{ id: 'openrouter:google/gemini-pro-1.5', name: 'Gemini 1.5 Pro', provider: 'openrouter', capabilities: ['chat', 'vision', 'audio', 'video', 'function_calling', 'streaming', 'json_mode'], enabled: true },
		{ id: 'openrouter:meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', provider: 'openrouter', capabilities: ['chat', 'function_calling', 'streaming', 'json_mode'], enabled: true },
	],
};

export function inferOpenAICapabilities(modelId: string): ModelCapability[] {
	const capabilities: ModelCapability[] = [];
	if (modelId.includes('embedding')) {
		return ['embedding'];
	}
	capabilities.push('chat', 'streaming', 'json_mode');
	if (modelId.startsWith('o1') || modelId.startsWith('o3')) {
		capabilities.push('reasoning');
		return capabilities; // o1/o3 don't have vision or function calling
	}
	if (modelId.includes('gpt-4o')) {
		capabilities.push('vision', 'audio', 'function_calling');
		return capabilities;
	}
	if (modelId.includes('gpt-4') && (modelId.includes('turbo') || modelId.includes('vision'))) {
		capabilities.push('vision', 'function_calling');
		return capabilities;
	}
	if (modelId.includes('gpt-4') || modelId.includes('gpt-3.5')) {
		capabilities.push('function_calling');
		return capabilities;
	}
	if (modelId.includes('gpt-5')) {
		capabilities.push('vision', 'function_calling');
		return capabilities;
	}

	return capabilities;
}

export function inferGoogleCapabilities(modelId: string): ModelCapability[] {
	const capabilities: ModelCapability[] = ['chat', 'streaming', 'json_mode'];
	if (modelId.includes('gemini-2')) {
		capabilities.push('vision', 'audio', 'video', 'function_calling');
		capabilities.push('multimodal_output', 'code_execution');
		if (modelId.includes('thinking')) {
			capabilities.push('reasoning');
		}
		return capabilities;
	}
	if (modelId.includes('gemini-1.5')) {
		capabilities.push('vision', 'audio', 'video', 'function_calling');
		return capabilities;
	}
	if (modelId.includes('gemini-pro')) {
		capabilities.push('function_calling');
		return capabilities;
	}

	return capabilities;
}

export function inferDeepSeekCapabilities(modelId: string): ModelCapability[] {
	const capabilities: ModelCapability[] = ['chat', 'streaming', 'json_mode'];
	if (modelId.includes('reasoner') || modelId.includes('-r1')) {
		capabilities.push('reasoning');
		return capabilities;
	}
	if (modelId.includes('v3') || modelId.includes('coder') || modelId.includes('chat')) {
		capabilities.push('function_calling');
	}

	return capabilities;
}
