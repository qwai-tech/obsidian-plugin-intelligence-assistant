import type { HttpPort } from '@qwai/obsidian-llm';
import type { WebSearchConfig } from '@/features/web-search/types/web-search';
import type { WebSearchResult } from './web-search-service';

export interface BackendContext {
	config: WebSearchConfig;
	http: HttpPort;
}

export type SearchBackend = (query: string, maxResults: number, context: BackendContext) => Promise<WebSearchResult[]>;

interface GoogleSearchItem {
	title: string;
	link: string;
	snippet?: string;
	displayLink?: string;
}

interface GoogleSearchResponse {
	items?: GoogleSearchItem[];
}

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

interface TavilySearchResult {
	title: string;
	url: string;
	content?: string;
}

interface TavilySearchResponse {
	results?: TavilySearchResult[];
}

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

/**
 * Search using Google Custom Search API
 */
async function searchGoogle(query: string, maxResults: number, { config, http }: BackendContext): Promise<WebSearchResult[]> {
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

		console.debug(`[WebSearch] Google found ${results.length} results`);
		return results;
	} catch (error) {
		console.error('[WebSearch] Google search error:', error);
		throw error;
	}
}

/**
 * Search using Bing Search API
 */
async function searchBing(query: string, maxResults: number, { config, http }: BackendContext): Promise<WebSearchResult[]> {
	if (!config.apiKey) {
		throw new Error('Bing API key is required for Bing search');
	}

	const searchUrl = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=${Math.min(maxResults, 50)}&mkt=${config.searchCountry || 'en-US'}&setLang=${config.searchLanguage || 'en'}`;
	
	try {
		const response = await http.request({
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

		console.debug(`[WebSearch] Bing found ${results.length} results`);
		return results;
	} catch (error) {
		console.error('[WebSearch] Bing search error:', error);
		throw error;
	}
}

/**
 * Search using SerpAPI
 */
async function searchSerpAPI(query: string, maxResults: number, { config, http }: BackendContext): Promise<WebSearchResult[]> {
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

		console.debug(`[WebSearch] SerpAPI found ${results.length} results`);
		return results;
	} catch (error) {
		console.error('[WebSearch] SerpAPI search error:', error);
		throw error;
	}
}

/**
 * Search using Tavily API
 */
async function searchTavily(query: string, maxResults: number, { config, http }: BackendContext): Promise<WebSearchResult[]> {
	const apiKey = config.tavilyApiKey || config.apiKey;
	if (!apiKey) {
		throw new Error('Tavily API key is required for Tavily search');
	}

	try {
		const response = await http.request({
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

		console.debug(`[WebSearch] Tavily found ${results.length} results`);
		return results;
	} catch (error) {
		console.error('[WebSearch] Tavily search error:', error);
		throw error;
	}
}

/**
 * Search using SearXNG instance
 */
async function searchSearXNG(query: string, maxResults: number, { config, http }: BackendContext): Promise<WebSearchResult[]> {
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

		console.debug(`[WebSearch] SearXNG found ${results.length} results`);
		return results;
	} catch (error) {
		console.error('[WebSearch] SearXNG search error:', error);
		throw error;
	}
}

/**
 * Search using Brave Search API
 */
async function searchBrave(query: string, maxResults: number, { config, http }: BackendContext): Promise<WebSearchResult[]> {
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

/**
 * Search using Qwant API
 */
async function searchQwant(query: string, maxResults: number, { config, http }: BackendContext): Promise<WebSearchResult[]> {
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

/**
 * Search using Mojeek API
 */
async function searchMojeek(query: string, maxResults: number, { config, http }: BackendContext): Promise<WebSearchResult[]> {
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
		const response = await http.request({
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

		console.debug(`[WebSearch] Mojeek found ${results.length} results`);
		return results;
	} catch (error) {
		console.error('[WebSearch] Mojeek search error:', error);
		throw error;
	}
}

export const SEARCH_BACKENDS: Record<string, SearchBackend> = {
	google: searchGoogle,
	bing: searchBing,
	serpapi: searchSerpAPI,
	tavily: searchTavily,
	searxng: searchSearXNG,
	brave: searchBrave,
	qwant: searchQwant,
	mojeek: searchMojeek,
};
