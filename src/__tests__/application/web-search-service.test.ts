import { WebSearchService, snippetToMarkdown } from '@/application/services/web-search-service';
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
			const googleClient: IHttpClient = {
				request: jest.fn(async () => ({
					status: 200,
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
					arrayBuffer: new ArrayBuffer(0),
				})),
			};
			const service = new WebSearchService(
				createConfig({ provider: 'google', apiKey: 'k', googleCseId: 'cx' }),
				googleClient,
			);

			const results = await service.search('latest TypeScript release notes 2025');

			expect(results).toHaveLength(1);
			expect(results[0].snippet).toBe('The **fastest** & safest *TypeScript* yet');
			expect(results[0].snippet).not.toMatch(/<[^>]+>/);
		});
	});
});
