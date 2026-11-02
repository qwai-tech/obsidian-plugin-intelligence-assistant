import { WebSearchService, snippetToMarkdown } from '@/features/web-search/web-search-service';
import { SEARCH_PROVIDER_IDS } from '@/features/web-search';
import type { HttpPort } from '@qwai/obsidian-llm';
import type { WebSearchConfig } from '@/features/web-search/types/web-search';

describe('WebSearchService', () => {
	const createConfig = (overrides: Partial<WebSearchConfig> = {}): WebSearchConfig => ({
		enabled: true,
		provider: 'google',
		maxResults: 5,
		autoTrigger: true,
		...overrides,
	});

	const httpClient = {
		request: jest.fn(),
		stream: jest.fn(),
	} as unknown as HttpPort;

	beforeEach(() => {
		jest.clearAllMocks();
		jest.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('returns no results when the configured provider fails instead of returning a placeholder result', async () => {
		const service = new WebSearchService(() => createConfig(), httpClient);

		const results = await service.search('latest TypeScript release');

		expect(results).toEqual([]);
		expect(results).not.toEqual(expect.arrayContaining([
			expect.objectContaining({
				source: 'google.com',
			}),
		]));
		expect(httpClient.request).not.toHaveBeenCalled();
	});

	it('reports a provider it has no backend for instead of silently finding nothing', async () => {
		const report = jest.fn();
		const service = new WebSearchService(() => createConfig({ provider: 'duckduckgo' }), httpClient, report);

		expect(await service.search('latest TypeScript release')).toEqual([]);
		expect(report).toHaveBeenCalledWith(expect.stringContaining('duckduckgo'));
	});

	it('reports a provider that is not set up, such as a missing API key', async () => {
		const report = jest.fn();
		const service = new WebSearchService(() => createConfig({ provider: 'brave' }), httpClient, report);

		expect(await service.search('latest TypeScript release')).toEqual([]);
		expect(report).toHaveBeenCalledWith('Brave API key is required for Brave search');
	});

	it('offers only providers that have a backend', () => {
		expect(SEARCH_PROVIDER_IDS).toEqual(['google', 'bing', 'serpapi', 'tavily', 'searxng', 'brave', 'qwant', 'mojeek']);
	});

	describe('htmlToMarkdown snippet cleanup', () => {
		it('converts HTML snippets to markdown via Obsidian htmlToMarkdown', () => {
			const html = 'Latest <b>TypeScript</b> release notes &amp; <a href="https://ts.dev">docs</a>';
			expect(snippetToMarkdown(html)).toBe('Latest **TypeScript** release notes & [docs](https://ts.dev)');
		});

		it('leaves plain-text snippets untouched', () => {
			const plain = 'A plain text snippet with no markup';
			expect(snippetToMarkdown(plain)).toBe(plain);
		});

		it('returns HTML-free markdown snippets from a real provider search path', async () => {
			const googleClient: HttpPort = {
				request: jest.fn(async () => ({
					status: 200,
					ok: true,
					headers: {},
					json: {
						items: [
							{
								title: 'TS 5 released',
								link: 'https://example.com/ts5',
								snippet: 'The <b>fastest</b> &amp; safest <i>TypeScript</i> yet',
								displayLink: 'example.com',
							},
						],
					},
					text: '',
				})),
				stream: jest.fn(),
			};
			const service = new WebSearchService(
				() => createConfig({ provider: 'google', apiKey: 'k', googleCseId: 'cx' }),
				googleClient,
			);

			const results = await service.search('latest TypeScript release notes 2025');

			expect(results).toHaveLength(1);
			expect(results[0].snippet).toBe('The **fastest** & safest *TypeScript* yet');
			expect(results[0].snippet).not.toMatch(/<[^>]+>/);
		});
	});
});
