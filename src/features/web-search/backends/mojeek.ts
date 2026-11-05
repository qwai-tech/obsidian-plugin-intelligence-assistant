import type { BackendContext } from './backend';
import type { WebSearchResult } from '../web-search-service';

interface MojeekResultItem {
	title: string;
	url: string;
	desc?: string;
}

interface MojeekSearchResponse {
	response?: {
		results?: MojeekResultItem[];
	};
}

export async function searchMojeek(query: string, maxResults: number, { config, http, signal }: BackendContext): Promise<WebSearchResult[]> {
	if (!config.mojeekApiKey) {
		throw new Error('Mojeek API key is required for Mojeek search');
	}

	const params = new URLSearchParams({
		q: query,
		format: 'json',
		num: Math.min(maxResults, 100).toString(),  // Mojeek supports up to 100 results
		ob: '0', // Order by relevance
		t: 'web'  // Type of search
	});

	if (config.searchCountry) {
		params.append('country', config.searchCountry);
	}

	if (config.searchLanguage) {
		params.append('language', config.searchLanguage);
	}

	if (config.timeRange && config.timeRange !== 'any') {
		params.append('date', config.timeRange);
	}

	const searchUrl = `https://api.mojeek.com/api/search?${params.toString()}`;
	
	try {
		const response = await http.request({ signal,
			url: searchUrl,
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${config.mojeekApiKey}`,
				'User-Agent': 'Obsidian-Intelligence-Assistant/1.0'
			}
		});

		if (response.status !== 200) {
			throw new Error(`Mojeek search failed: ${response.status}`);
		}

		const data = response.json as MojeekSearchResponse;
		const results: WebSearchResult[] = [];

		if (data.response?.results && Array.isArray(data.response.results)) {
			for (const item of data.response.results) {
				if (results.length >= maxResults) break;
				results.push({
					title: item.title,
					url: item.url,
					snippet: item.desc || 'No description available',
					source: new URL(item.url).hostname
				});
			}
		}

		return results;
	} catch (error) {
		console.error('[WebSearch] Mojeek search error:', error);
		throw error;
	}
}
