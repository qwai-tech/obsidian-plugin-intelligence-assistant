import { LLMHubService } from '@/features/llm/llm-hub-service';
import { LLM_HUB_API_VERSION, ModelManager, ProviderFactory } from '@qwai/obsidian-llm';
import type { LLMConfig, ModelInfo } from '@qwai/obsidian-llm';

jest.mock('@qwai/obsidian-llm', () => ({
	LLM_HUB_API_VERSION: 1,
	ModelManager: {
		getAllAvailableModels: jest.fn(),
		findConfigForModelByProvider: jest.fn(),
	},
	ProviderFactory: {
		createProvider: jest.fn(),
	},
}));

const SECRET = 'sk-do-not-leak';

const configs: LLMConfig[] = [
	{ provider: 'openai', apiKey: SECRET, baseUrl: 'https://api.openai.com/v1' },
];

function model(id: string, enabled: boolean): ModelInfo {
	return { id, name: id, provider: 'openai', capabilities: ['chat'], enabled };
}

describe('LLMHubService', () => {
	let hub: LLMHubService;

	beforeEach(() => {
		jest.clearAllMocks();
		hub = new LLMHubService({
			getLLMConfigs: () => configs,
			getDefaultModelId: () => 'openai:gpt-4o',
		});
	});

	it('advertises the shared API version so consumers can gate on it', () => {
		expect(hub.apiVersion).toBe(LLM_HUB_API_VERSION);
	});

	it('lists only models the user enabled', async () => {
		(ModelManager.getAllAvailableModels as jest.Mock).mockResolvedValue([
			model('openai:gpt-4o', true),
			model('openai:retired', false),
		]);

		const models = await hub.listModels();

		expect(models.map(m => m.id)).toEqual(['openai:gpt-4o']);
	});

	it('returns a usable provider for a configured model', async () => {
		const provider = { name: 'OpenAI', chat: jest.fn(), streamChat: jest.fn() };
		(ModelManager.findConfigForModelByProvider as jest.Mock).mockReturnValue(configs[0]);
		(ProviderFactory.createProvider as jest.Mock).mockReturnValue(provider);

		await expect(hub.getProvider('openai:gpt-4o')).resolves.toBe(provider);
	});

	it('returns null instead of throwing when no config matches', async () => {
		(ModelManager.findConfigForModelByProvider as jest.Mock).mockReturnValue(null);
		await expect(hub.getProvider('unknown:model')).resolves.toBeNull();
	});

	it('exposes the default model id', async () => {
		await expect(hub.getDefaultModelId()).resolves.toBe('openai:gpt-4o');
	});

	// The security invariant this class exists to hold. Obsidian has no permission
	// model, so every enabled plugin can read whatever the hub exposes. If a future
	// change adds a config- or key-returning method, this fails.
	describe('lends capability, never credentials', () => {
		it('has no method that returns configuration or a key', () => {
			const surface = [
				...Object.keys(hub),
				...Object.getOwnPropertyNames(Object.getPrototypeOf(hub)),
			];

			expect(surface).not.toContain('getConfig');
			expect(surface).not.toContain('getApiKey');
			expect(surface).not.toContain('getLLMConfigs');
		});

		// TypeScript's `private` is erased at compile time, so a `private host`
		// field would still be readable as `hub.host` by any plugin holding this
		// object -- and `host.getLLMConfigs()` returns the keys. Assert the host is
		// unreachable at RUNTIME, which only a `#` field gives us.
		it('does not expose the settings host as a reachable property', () => {
			const reachable = hub as unknown as Record<string, unknown>;

			expect(reachable.host).toBeUndefined();
			expect(Object.keys(hub)).not.toContain('host');
			expect(JSON.stringify(hub)).not.toContain('getLLMConfigs');
		});

		it('never returns the api key through any public method', async () => {
			const provider = { name: 'OpenAI', chat: jest.fn(), streamChat: jest.fn() };
			(ModelManager.getAllAvailableModels as jest.Mock).mockResolvedValue([model('openai:gpt-4o', true)]);
			(ModelManager.findConfigForModelByProvider as jest.Mock).mockReturnValue(configs[0]);
			(ProviderFactory.createProvider as jest.Mock).mockReturnValue(provider);

			const returned = JSON.stringify([
				await hub.listModels(),
				await hub.getProvider('openai:gpt-4o'),
				await hub.getDefaultModelId(),
			]);

			expect(returned).not.toContain(SECRET);
		});
	});
});
