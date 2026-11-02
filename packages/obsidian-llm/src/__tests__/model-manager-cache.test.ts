import { ModelManager } from '../model-manager';
import { setDefaultHttpPort, resetDefaultHttpPort, type HttpPort } from '../http';
import type { LLMConfig, ModelInfo } from '../types';

const model = (id: string): ModelInfo => ({ id, name: id, provider: 'openai', capabilities: [], enabled: true });

const portListing = (ids: string[]) => {
	const port = {
		request: jest.fn(async () => ({ status: 200, ok: true, text: '', headers: {}, json: { data: ids.map((id) => ({ id })) } })),
		stream: jest.fn(),
	};
	setDefaultHttpPort(port as unknown as HttpPort);
	return port;
};

describe('ModelManager model cache', () => {
	afterEach(() => resetDefaultHttpPort());

	it('serves the stored model list without a request', async () => {
		const port = portListing(['gpt-new']);
		const config: LLMConfig = { provider: 'openai', apiKey: 'k1', cachedModels: [model('gpt-stored')] };

		const models = await ModelManager.getModelsForConfig(config);

		expect(models.map((m) => m.id)).toEqual(['gpt-stored']);
		expect(port.request).not.toHaveBeenCalled();
	});

	it('refreshes on request and stores the result on the config', async () => {
		portListing(['gpt-4o']);
		const config: LLMConfig = { provider: 'openai', apiKey: 'k2', cachedModels: [model('gpt-old')] };

		await ModelManager.getModelsForConfig(config, true);

		expect(config.cachedModels?.map((m) => m.id)).toEqual(['openai:gpt-4o']);
		expect(config.cacheTimestamp).toBeGreaterThan(0);
	});

	it('keeps models the user switched off switched off after a refresh', async () => {
		portListing(['gpt-4o', 'gpt-4o-mini']);
		const config: LLMConfig = { provider: 'openai', apiKey: 'k5', cachedModels: [{ ...model('openai:gpt-4o-mini'), enabled: false }] };

		await ModelManager.getModelsForConfig(config, true);

		expect(config.cachedModels?.map((m) => [m.id, m.enabled !== false])).toEqual([['openai:gpt-4o', true], ['openai:gpt-4o-mini', false]]);
	});

	it('gives each config its own copies of the built-in model list', async () => {
		const first: LLMConfig = { provider: 'anthropic', apiKey: 'a1' };
		const second: LLMConfig = { provider: 'anthropic', apiKey: 'a2' };
		await ModelManager.getModelsForConfig(first, true);
		await ModelManager.getModelsForConfig(second, true);

		first.cachedModels![0].enabled = false;

		expect(second.cachedModels![0].enabled).not.toBe(false);
	});

	it('reflects edits to the stored list on the next call', async () => {
		portListing(['gpt-4o']);
		const config: LLMConfig = { provider: 'openai', apiKey: 'k3' };
		await ModelManager.getModelsForConfig(config, true);

		config.cachedModels = [model('gpt-edited')];

		expect((await ModelManager.getModelsForConfig(config)).map((m) => m.id)).toEqual(['gpt-edited']);
	});

	it('shares one request between concurrent refreshes of the same provider', async () => {
		const port = portListing(['gpt-4o']);
		const config: LLMConfig = { provider: 'openai', apiKey: 'k4' };

		await Promise.all([ModelManager.getModelsForConfig(config, true), ModelManager.getModelsForConfig(config, true)]);

		expect(port.request).toHaveBeenCalledTimes(1);
	});

	it('leaves embedding-only models out of the chat models', async () => {
		const config: LLMConfig = { provider: 'ollama', cachedModels: [
			{ id: 'ollama:qwen3.5:0.8b', name: 'qwen3.5:0.8b', provider: 'ollama', capabilities: ['chat', 'streaming'], enabled: true },
			{ id: 'ollama:qwen3-embedding:4b', name: 'qwen3-embedding:4b', provider: 'ollama', capabilities: ['embedding'], enabled: true },
			{ id: 'ollama:unknown', name: 'unknown', provider: 'ollama', capabilities: [], enabled: true },
		] };

		const models = await ModelManager.getAllChatModels([config]);

		expect(models.map((m) => m.id)).toEqual(['ollama:qwen3.5:0.8b', 'ollama:unknown']);
	});

	it.each(['openai', 'custom', 'google', 'deepseek', 'openrouter'])('fails a %s refresh against an endpoint that rejects the request, keeping the stored models', async (provider) => {
		setDefaultHttpPort({
			request: jest.fn(async () => ({ status: 404, ok: false, text: 'Not Found', headers: {}, json: undefined })),
			stream: jest.fn(),
		} as unknown as HttpPort);
		const config: LLMConfig = { provider, apiKey: `bad-${provider}`, baseUrl: 'http://127.0.0.1:9/v1', cachedModels: [model('stored')] };

		await expect(ModelManager.getModelsForConfig(config, true)).rejects.toThrow('404');

		expect(config.cachedModels?.map((m) => m.id)).toEqual(['stored']);
	});

	it('keeps every model an OpenAI-compatible gateway lists', async () => {
		portListing(['deepseek/deepseek-flash', 'deepseek/deepseek-v4-pro', 'gpt-4o']);
		const config: LLMConfig = { provider: 'openai', apiKey: 'gw', baseUrl: 'https://gateway.example.com/v1' };

		const models = await ModelManager.getModelsForConfig(config, true);

		expect(models.map((m) => m.name)).toEqual(['deepseek/deepseek-flash', 'deepseek/deepseek-v4-pro', 'gpt-4o']);
	});

	it('lists only chat and embedding models from OpenAI itself', async () => {
		portListing(['gpt-4o', 'dall-e-3', 'whisper-1', 'text-embedding-3-small']);
		const config: LLMConfig = { provider: 'openai', apiKey: 'official' };

		const models = await ModelManager.getModelsForConfig(config, true);

		expect(models.map((m) => m.name)).toEqual(['gpt-4o', 'text-embedding-3-small']);
	});
});
