import type { BackendContext } from './backend';
import type { WebSearchResult } from '../web-search-service';

interface BingWebPage {
	name: string;
	url: string;
	snippet?: string;
}

interface BingSearchResponse {
	webPages?: {
		value?: BingWebPage[];
	};
}

export async function searchBing(query: string, maxResults: number, { config, http, signal }: BackendContext): Promise<WebSearchResult[]> {
	if (!config.apiKey) {
		throw new Error('Bing API key is required for Bing search');
	}

	const searchUrl = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=${Math.min(maxResults, 50)}&mkt=${config.searchCountry || 'en-US'}&setLang=${config.searchLanguage || 'en'}`;
	
	try {
		const response = await http.request({ signal,
			url: searchUrl,
			method: 'GET',
			headers: {
				'Ocp-Apim-Subscription-Key': config.apiKey
			}
		});

		if (response.status !== 200) {
			throw new Error(`Bing search failed: ${response.status}`);
		}

		const data = response.json as BingSearchResponse;
		const results: WebSearchResult[] = [];

		if (data.webPages && data.webPages.value && Array.isArray(data.webPages.value)) {
			for (const item of data.webPages.value) {
				results.push({
					title: item.name,
					url: item.url,
					snippet: item.snippet || 'No description available',
					source: new URL(item.url).hostname
				});
			}
		}

		return results;
	} catch (error) {
		console.error('[WebSearch] Bing search error:', error);
		throw error;
	}
}
