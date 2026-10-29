import type { BackendContext } from './backend';
import type { WebSearchResult } from '../web-search-service';

interface QwantSearchItem {
	title: string;
	url: string;
	desc?: string;
	domain?: string;
}

interface QwantSearchResponse {
	data?: {
		result?: {
			items?: QwantSearchItem[];
		};
	};
}

export async function searchQwant(query: string, maxResults: number, { config, http }: BackendContext): Promise<WebSearchResult[]> {
	const params = new URLSearchParams({
		q: query,
		count: maxResults.toString(),
		t: 'web', // Type: web, news, images, videos
		safesearch: '0' // Disable safe search
	});

	if (config.searchLanguage) {
		params.append('locale', config.searchLanguage);
	}

	const headers: Record<string, string> = {
		'Accept': 'application/json',
		'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
	};

	// Add API key to headers if provided
	if (config.qwantApiKey) {
		headers['Authorization'] = `Bearer ${config.qwantApiKey}`;
	}

	const searchUrl = `https://api.qwant.com/api/search/web?${params.toString()}`;
	
	try {
		const response = await http.request({
			url: searchUrl,
			method: 'GET',
			headers: headers
		});

		if (response.status !== 200) {
			throw new Error(`Qwant search failed: ${response.status}`);
		}

		const data = response.json as QwantSearchResponse;
		if (!data || !data.data || !data.data.result) {
			throw new Error('Invalid response from Qwant API');
		}

		const results: WebSearchResult[] = [];
		const items = data.data.result.items;

		if (items && Array.isArray(items)) {
			for (const item of items) {
				if (results.length >= maxResults) break;
				results.push({
					title: item.title,
					url: item.url,
					snippet: item.desc || 'No description available',
					source: item.domain || new URL(item.url).hostname
				});
			}
		}

		console.debug(`[WebSearch] Qwant found ${results.length} results`);
		return results;
	} catch (error) {
		console.error('[WebSearch] Qwant search error:', error);
		throw error;
	}
}
