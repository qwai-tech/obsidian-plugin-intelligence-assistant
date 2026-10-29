import type { BackendContext } from './backend';
import type { WebSearchResult } from '../web-search-service';

interface BraveWebResult {
	title: string;
	url: string;
	description?: string;
}

interface BraveWebSearchResponse {
	web?: {
		results?: BraveWebResult[];
	};
}

export async function searchBrave(query: string, maxResults: number, { config, http }: BackendContext): Promise<WebSearchResult[]> {
	if (!config.apiKey && !config.braveApiKey) {
		throw new Error('Brave API key is required for Brave search');
	}

	const apiKey = config.braveApiKey || config.apiKey;
	if (!apiKey) {
		throw new Error('Brave API key is required for Brave search');
	}
	
	const headers: Record<string, string> = {
		'Accept': 'application/json',
		'X-Subscription-Token': apiKey
	};

	const params = new URLSearchParams({
		q: query,
		count: Math.min(maxResults, 20).toString(),
		offset: '0',
		safesearch: 'MODERATE'
	});

	if (config.searchLanguage) {
		params.append('country', config.searchCountry || 'US');
		headers['Accept-Language'] = config.searchLanguage;
	}

	if (config.includeDomains) {
		params.append('domain', config.includeDomains.split(',')[0].trim());
	}

	if (config.excludeDomains) {
		// Brave doesn't have a direct exclude parameter, so we'll filter results
	}

	const searchUrl = `https://api.search.brave.com/res/v1/web/search?${params.toString()}`;
	
	try {
		const response = await http.request({
			url: searchUrl,
			method: 'GET',
			headers: headers
		});

		if (response.status !== 200) {
			throw new Error(`Brave search failed: ${response.status}`);
		}

		const data = response.json as BraveWebSearchResponse;
		const results: WebSearchResult[] = [];

		if (data.web?.results && Array.isArray(data.web.results)) {
			for (const item of data.web.results) {
				results.push({
					title: item.title,
					url: item.url,
					snippet: item.description || 'No description available',
					source: new URL(item.url).hostname
				});
			}
		}

		console.debug(`[WebSearch] Brave found ${results.length} results`);
		return results;
	} catch (error) {
		console.error('[WebSearch] Brave search error:', error);
		throw error;
	}
}
