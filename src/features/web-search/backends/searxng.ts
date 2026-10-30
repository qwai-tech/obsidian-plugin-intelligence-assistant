import type { BackendContext } from './backend';
import type { WebSearchResult } from '../web-search-service';

interface SearchApiResult {
	url?: string;
	title: string;
	content?: string;
	description?: string;
	engine?: string;
}

interface SearchApiResponse {
	results?: SearchApiResult[];
}

export async function searchSearXNG(query: string, maxResults: number, { config, http }: BackendContext): Promise<WebSearchResult[]> {
	if (!config.searxngEndpoint) {
		throw new Error('SearXNG endpoint is required for SearXNG search');
	}

	const params = new URLSearchParams({
		q: query,
		limit: Math.min(maxResults, 20).toString(),
		language: config.searchLanguage || 'en',
		safesearch: '0' // Disable safe search
	});

	if (config.timeRange && config.timeRange !== 'any') {
		params.append('time_range', config.timeRange);
	}

	const searchUrl = `${config.searxngEndpoint}?${params.toString()}`;
	
	try {
		const response = await http.request({
			url: searchUrl,
			method: 'GET',
			headers: {
				'Accept': 'application/json'
			}
		});

		if (response.status !== 200) {
			throw new Error(`SearXNG search failed: ${response.status}`);
		}

		const data = response.json as SearchApiResponse;
		const results: WebSearchResult[] = [];

		if (data.results && Array.isArray(data.results)) {
			for (const item of data.results) {
				if (results.length >= maxResults) break;
				if (item.url && item.title) {
					results.push({
						title: item.title,
						url: item.url,
						snippet: item.content || item.description || 'No description available',
						source: item.engine || new URL(item.url).hostname
					});
				}
			}
		}

		return results;
	} catch (error) {
		console.error('[WebSearch] SearXNG search error:', error);
		throw error;
	}
}
