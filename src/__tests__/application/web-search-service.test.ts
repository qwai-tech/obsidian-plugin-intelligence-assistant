import { WebSearchService } from '@/application/services/web-search-service';
import type { IHttpClient } from '@/core/interfaces';
import type { WebSearchConfig } from '@/types';

describe('WebSearchService', () => {
	const createConfig = (overrides: Partial<WebSearchConfig> = {}): WebSearchConfig => ({
		enabled: true,
		provider: 'google',
		maxResults: 5,
		autoTrigger: true,
		...overrides,
	});

	const httpClient: IHttpClient = {
		request: jest.fn(),
	};

	beforeEach(() => {
		jest.clearAllMocks();
		jest.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('returns no results when the configured provider fails instead of returning a placeholder result', async () => {
		const service = new WebSearchService(createConfig(), httpClient);

		const results = await service.search('latest TypeScript release');

		expect(results).toEqual([]);
		expect(results).not.toEqual(expect.arrayContaining([
			expect.objectContaining({
				source: 'google.com',
			}),
		]));
		expect(httpClient.request).not.toHaveBeenCalled();
	});
});
