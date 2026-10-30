import type { BackendContext } from './backend';
import type { WebSearchResult } from '../web-search-service';

interface SerpApiOrganicResult {
	title: string;
	link: string;
	snippet?: string;
	description?: string;
	source?: string;
}

interface SerpApiResponse {
	organic_results?: SerpApiOrganicResult[];
}

export async function searchSerpAPI(query: string, maxResults: number, { config, http }: BackendContext): Promise<WebSearchResult[]> {
	if (!config.apiKey) {
		throw new Error('SerpAPI key is required for SerpAPI search');
	}

	const params = new URLSearchParams({
		q: query,
		hl: config.searchLanguage || 'en',
		gl: config.searchCountry || 'us',
		num: Math.min(maxResults, 100).toString(),
		api_key: config.apiKey
	});

	if (config.includeDomains) {
		params.append('site', config.includeDomains.split(',')[0].trim()); // SerpAPI supports only one site filter
	}

	if (config.timeRange && config.timeRange !== 'any') {
		params.append('tbs', `qdr:${config.timeRange}`);
	}

	const endpoint = config.serpapiEndpoint || 'https://serpapi.com/search';
	const searchUrl = `${endpoint}?${params.toString()}`;
	
	try {
		const response = await http.request({
			url: searchUrl,
			method: 'GET',
		});

		if (response.status !== 200) {
			throw new Error(`SerpAPI search failed: ${response.status}`);
		}

		const data = response.json as SerpApiResponse;
		const results: WebSearchResult[] = [];

		if (data.organic_results && Array.isArray(data.organic_results)) {
			for (const item of data.organic_results) {
				results.push({
					title: item.title,
					url: item.link,
					snippet: item.snippet || item.description || 'No description available',
					source: item.source || new URL(item.link).hostname
				});
			}
		}

		return results;
	} catch (error) {
		console.error('[WebSearch] SerpAPI search error:', error);
		throw error;
	}
}
