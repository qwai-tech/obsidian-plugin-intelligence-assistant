import type { BackendContext } from './backend';
import type { WebSearchResult } from '../web-search-service';

interface GoogleSearchItem {
	title: string;
	link: string;
	snippet?: string;
	displayLink?: string;
}

interface GoogleSearchResponse {
	items?: GoogleSearchItem[];
}

export async function searchGoogle(query: string, maxResults: number, { config, http }: BackendContext): Promise<WebSearchResult[]> {
	if (!config.apiKey) {
		throw new Error('Google API key is required for Google search');
	}
	
	if (!config.googleCseId) {
		throw new Error('Google Custom Search Engine ID is required for Google search');
	}

	const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${config.apiKey}&cx=${config.googleCseId}&q=${encodeURIComponent(query)}&num=${Math.min(maxResults, 10)}&lr=${config.searchLanguage || 'lang_en'}`;
	
	try {
		const response = await http.request({
			url: searchUrl,
			method: 'GET',
		});

		if (response.status !== 200) {
			throw new Error(`Google search failed: ${response.status}`);
		}

		const data = response.json as GoogleSearchResponse;
		const results: WebSearchResult[] = [];

		if (data.items && Array.isArray(data.items)) {
			for (const item of data.items) {
				results.push({
					title: item.title,
					url: item.link,
					snippet: item.snippet || 'No description available',
					source: item.displayLink || new URL(item.link).hostname
				});
			}
		}

		return results;
	} catch (error) {
		console.error('[WebSearch] Google search error:', error);
		throw error;
	}
}
