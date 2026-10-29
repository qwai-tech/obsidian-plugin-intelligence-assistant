import { ModelManager } from '../model-manager';
import { setDefaultHttpPort, resetDefaultHttpPort, type HttpPort } from '../http';
import type { LLMConfig, ModelInfo } from '../types';

const model = (id: string): ModelInfo => ({ id, name: id, provider: 'openai', capabilities: [] });

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
});
