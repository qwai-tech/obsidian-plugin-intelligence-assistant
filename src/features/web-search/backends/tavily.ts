import type { BackendContext } from './backend';
import type { WebSearchResult } from '../web-search-service';

interface TavilySearchResult {
	title: string;
	url: string;
	content?: string;
}

interface TavilySearchResponse {
	results?: TavilySearchResult[];
}

export async function searchTavily(query: string, maxResults: number, { config, http, signal }: BackendContext): Promise<WebSearchResult[]> {
	const apiKey = config.tavilyApiKey || config.apiKey;
	if (!apiKey) {
		throw new Error('Tavily API key is required for Tavily search');
	}

	try {
		const response = await http.request({ signal,
			url: 'https://api.tavily.com/search',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				api_key: apiKey,
				query: query,
				max_results: maxResults,
				search_depth: "basic", // or "advanced" for more thorough search
				include_answer: false,
				include_images: false,
				include_raw_content: false,
				result_format: "json",
				pretty: false
			})
		});

		if (response.status !== 200) {
			throw new Error(`Tavily search failed: ${response.status}`);
		}

		const data = response.json as TavilySearchResponse;
		const results: WebSearchResult[] = [];

		if (data.results && Array.isArray(data.results)) {
			for (const item of data.results) {
				results.push({
					title: item.title,
					url: item.url,
					snippet: item.content || 'No description available',
					source: new URL(item.url).hostname
				});
			}
		}

		return results;
	} catch (error) {
		console.error('[WebSearch] Tavily search error:', error);
		throw error;
	}
}
