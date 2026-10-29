import { ChatService } from '@/features/chat/chat.service';
import { WebSearchService } from '@/features/web-search/web-search-service';
import type { LLMConfig } from '@/features/llm/types/model';
import type { WebSearchConfig } from '@/features/web-search/types/web-search';

describe('services read settings at call time', () => {
	it('ChatService resolves a provider added after it was built', () => {
		const settings = { llmConfigs: [] as LLMConfig[], defaultModel: undefined as string | undefined };
		const service = new ChatService({
			fileSystem: {} as never,
			knowledge: {} as never,
			webSearchService: {} as never,
			settings: () => settings,
		});

		settings.llmConfigs.push({ provider: 'openai', apiKey: 'k', cachedModels: [{ id: 'gpt-x', name: 'gpt-x', provider: 'openai', capabilities: [] }] } as unknown as LLMConfig);

		expect(service.findLLMConfig('gpt-x')?.provider).toBe('openai');
	});

	it('WebSearchService uses the provider configured at search time', async () => {
		const config = { enabled: true, provider: 'duckduckgo', maxResults: 3 } as WebSearchConfig;
		const httpClient = { request: jest.fn(async () => ({ status: 200, json: { items: [] }, text: '' })) };
		const service = new WebSearchService(() => config, httpClient as never);

		config.provider = 'google';
		config.apiKey = 'key';
		config.googleCseId = 'cx';
		await service.search('typescript release notes');

		const calls = httpClient.request.mock.calls as unknown as Array<[{ url: string }]>;
		expect(calls[0][0].url).toContain('googleapis.com');
	});
});
