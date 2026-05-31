import { EmbeddingManager } from '@/infrastructure/embedding-manager';
import { ProviderFactory } from '@/infrastructure/llm/provider-factory';

jest.mock('@/infrastructure/llm/provider-factory', () => ({
	ProviderFactory: {
		createProvider: jest.fn(),
	},
}));

describe('EmbeddingManager', () => {
	beforeEach(() => {
		(ProviderFactory.createProvider as jest.Mock).mockReset();
		(ProviderFactory.createProvider as jest.Mock).mockReturnValue({
			generateEmbedding: jest.fn(async () => [0.1, 0.2, 0.3]),
		});
	});

	it('uses the embedding model provider instead of falling back to the first LLM config', async () => {
		await EmbeddingManager.generateEmbedding(
			'hello',
			'text-embedding-3-small',
			[
				{ provider: 'deepseek', apiKey: 'bad-deepseek-key' },
				{ provider: 'openai', apiKey: 'openai-key' },
			] as any,
		);

		expect(ProviderFactory.createProvider).toHaveBeenCalledWith(expect.objectContaining({ provider: 'openai' }));
	});

	it('rejects unsupported local defaults without calling a chat provider embedding endpoint', async () => {
		await expect(EmbeddingManager.generateEmbedding(
			'hello',
			'all-MiniLM-L6-v2',
			[{ provider: 'deepseek', apiKey: 'deepseek-key' }] as any,
		)).rejects.toThrow('does not have a configured embedding provider');

		expect(ProviderFactory.createProvider).not.toHaveBeenCalled();
	});
});
