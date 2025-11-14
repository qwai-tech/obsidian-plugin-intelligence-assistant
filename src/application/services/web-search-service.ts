import { requestUrl } from 'obsidian';
import type { WebSearchConfig } from '@/types';

export interface WebSearchResult {
	title: string;
	url: string;
	snippet: string;
	source?: string;
	image?: string; // For image results
	date?: string; // For news results
}

// API Response Type Interfaces
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

interface BraveSearchResult {
	title: string;
	url: string;
	content?: string;
	snippet?: string;
}

interface BraveSearchResponse {
	results?: BraveSearchResult[];
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

interface KagiWebResult {
	title: string;
	url: string;
	description?: string;
	snippet?: string;
	domain?: string;
}

interface KagiSearchResponse {
	web?: KagiWebResult[];
}

interface JinaSearchItem {
	title: string;
	url: string;
	desc?: string;
	domain?: string;
}

interface JinaSearchResponse {
	data?: JinaSearchItem[] | JinaSearchItem;
	results?: JinaSearchItem[];
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

export class WebSearchService {
	private config: WebSearchConfig;

	constructor(config: WebSearchConfig) {
		this.config = config;
	}

	/**
	 * Process user input and determine if web search is needed
	 */
	private preprocessQuery(userInput: string): string | null {
		if (!userInput || typeof userInput !== 'string') {
			return null;
		}

		// Clean the input
		let cleanedInput = userInput.trim();
		
		// Remove common prefixes that indicate the user wants to search
		const searchIndicators = [
			'find:', 'search:', 'google:', 'bing:', 'search for:', 
			'look up:', 'find me:', 'find information about:'
		];
		
		for (const indicator of searchIndicators) {
			if (cleanedInput.toLowerCase().startsWith(indicator)) {
				cleanedInput = cleanedInput.substring(indicator.length).trim();
				break;
			}
		}

		// Filter out potentially harmful or inappropriate queries
		if (!this.isValidQuery(cleanedInput)) {
			return null;
		}

		// If query is too short or lacks informational intent, return null
		if (cleanedInput.length < 2) {
			return null;
		}

		return cleanedInput;
	}

	/**
	 * Validate if the query is appropriate for web searching
	 */
	private isValidQuery(query: string): boolean {
		// Check for potentially harmful patterns
		const harmfulPatterns = [
			/^\s*execut/i,
			/^\s*system\(/,
			/^\s*eval\s*\(/,
			/^\s*import\s+/,
			/\b(os|sys|subprocess|exec|eval|import|require)\b/
		];

		for (const pattern of harmfulPatterns) {
			if (pattern.test(query)) {
				return false;
			}
		}

		// Check for non-informational queries
		const nonInfoQueries = [
			'hello', 'hi', 'hey', 'ok', 'yes', 'no', 'thanks', 'thank you',
			'please', 'okay', 'cool', 'great', 'awesome', 'nice'
		];

		const lowerQuery = query.toLowerCase().trim();
		if (nonInfoQueries.includes(lowerQuery)) {
			return false; // These queries don't require web search
		}

		return true;
	}

	/**
	 * Determine if a query would benefit from a web search
	 */
	private shouldSearch(query: string): boolean {
		// Common informational patterns that suggest search would be helpful
		const infoPattern = /(?:what is|who is|how to|why is|when is|where is|define:|explain|tell me about|show me|find|information about|details on|facts about|latest news about|current status of|research on|study on)/i;
		
		// Check if query contains informational phrases
		if (infoPattern.test(query)) {
			return true;
		}

		// Check if query contains likely search terms (not conversational)
		// Look for specific terms, questions, or topics
		const likelySearchTerms = /(?:\?|current|latest|new|today|now|recent|upcoming|news|trends|statistics|data|research|study|report|analysis|market|price|cost|buy|where to|how much|how many|review|comparison)/i;
		
		if (likelySearchTerms.test(query)) {
			return true;
		}

		// Check if query is a specific question or contains keywords that require external knowledge
		const specificTerms = /\b(?:news|events|updates|prices|weather|stocks|sports|scores|facts|statistics|research|studies|science|technology|health|medical|law|policy|government|politics|finance|economics|education|university|school|history|geography|culture|art|music|movies|tv|books|authors|biology|chemistry|physics|math|formula|equation|programming|code|software|hardware|gaming|sports|athletes|teams|games|tournaments|celebrity|actors|actresses|movies|films|reviews|ratings|restaurants|food|recipe|cooking|recipe|cooking|travel|vacation|hotel|flight|destination|weather|temperature|climate|environment|pollution|climate change)\b/i;
		
		if (specificTerms.test(query)) {
			return true;
		}

		return false;
	}

	/**
	 * Determine the query type based on content for better LLM integration
	 */
	private analyzeQueryType(query: string): 'factual' | 'opinion' | 'instruction' | 'conversational' | 'informational' {
		const lowerQuery = query.toLowerCase();
		
		// Factual queries - seeking specific facts, dates, definitions
		if (/(what is|who is|when is|where is|define|definition|meaning|fact|facts|date|year|time|how many|number of|quantity|amount|size|count|total|population|price|cost)\b/.test(lowerQuery)) {
			return 'factual';
		}
		
		// Opinion queries - seeking opinions or reviews
		if (/(think|opinion|review|best|top|greatest|worst|favorite|recommended|should i|would you recommend)\b/.test(lowerQuery)) {
			return 'opinion';
		}
		
		// Instruction queries - seeking how-to information
		if (/(how to|steps to|guide|tutorial|instructions|how do i|how can i|method|technique|way to|do this|make|create|build|start|begin)\b/.test(lowerQuery)) {
			return 'instruction';
		}
		
		// Conversational queries - casual conversation
		if (/(hello|hi|hey|thanks|thank you|ok|okay|cool|great|awesome|nice|good|bad|well|yes|no|maybe|perhaps)\b/.test(lowerQuery)) {
			return 'conversational';
		}
		
		// Default to informational for other types
		return 'informational';
	}

	/**
	 * Optimize the query for better search results
	 */
	private optimizeQuery(query: string): string {
		// Analyze the query type to determine optimization strategy
		const queryType = this.analyzeQueryType(query);
		
		// Remove common stop words and phrases that might not be useful for search
		let optimizedQuery = query;
		
		// Remove common conversational phrases that don't add search value
		const conversationalPhrases = [
			'please', 'could you', 'would you', 'can you', 'i want', 'i need', 'i would like'
		];
		
		for (const phrase of conversationalPhrases) {
			const regex = new RegExp(`\\b${phrase}\\b`, 'gi');
			optimizedQuery = optimizedQuery.replace(regex, '');
		}

		// Clean up extra whitespace and normalize
		optimizedQuery = optimizedQuery.replace(/\s+/g, ' ').trim();

		// If the query contains question words, try to restructure for search based on query type
		const questionWords = ['what', 'who', 'where', 'when', 'why', 'how'];
		const containsQuestionWord = questionWords.some(word => 
			optimizedQuery.toLowerCase().startsWith(word + ' ') || 
			optimizedQuery.toLowerCase().includes(' ' + word + ' '));

		if (containsQuestionWord) {
			// For factual queries, extract the core subject
			if (queryType === 'factual') {
				questionWords.forEach(word => {
					const regex = new RegExp(`\\b${word}\\b\\s+`, 'gi');
					optimizedQuery = optimizedQuery.replace(regex, '');
				});
			} else if (queryType === 'instruction') {
				// For instruction queries, keep "how to" structure if it's at the beginning
				if (!optimizedQuery.toLowerCase().startsWith('how to')) {
					questionWords.forEach(word => {
						const regex = new RegExp(`\\b${word}\\b\\s+`, 'gi');
						optimizedQuery = optimizedQuery.replace(regex, '');
					});
				}
			}
			
			// Clean up again after processing
			optimizedQuery = optimizedQuery.replace(/\s+/g, ' ').trim();
		}

		// Ensure we still have a meaningful query after optimization
		if (optimizedQuery.length < 2) {
			optimizedQuery = query; // Revert if optimization removed too much
		}

		return optimizedQuery;
	}

	/**
	 * Search the web using configured provider
	 */
	async search(userInput: string): Promise<WebSearchResult[]> {
		try {
			// Preprocess the user input
			const processedQuery = this.preprocessQuery(userInput);
			
			if (!processedQuery) {
				console.debug('[WebSearch] Query was filtered out or is too short');
				return []; // Return empty results if query is not valid
			}

			// Determine if this query would benefit from web search
			if (!this.shouldSearch(processedQuery)) {
				console.debug('[WebSearch] Query does not seem to require web search, skipping');
				return []; // Return empty results if search is not appropriate
			}

			// Optimize the query for better search results
			const optimizedQuery = this.optimizeQuery(processedQuery);

			console.debug(`[WebSearch] Searching for: "${optimizedQuery}" using provider: ${this.config.provider}`);

			const maxResults = this.config.maxResults || 5;
			
			switch (this.config.provider) {
				case 'google':
					return await this.searchGoogle(optimizedQuery, maxResults);
				case 'bing':
					return await this.searchBing(optimizedQuery, maxResults);
				case 'duckduckgo':
					return await this.searchDuckDuckGo(optimizedQuery, maxResults);
				case 'serpapi':
					return await this.searchSerpAPI(optimizedQuery, maxResults);
				case 'tavily':
					return await this.searchTavily(optimizedQuery, maxResults);
				case 'searxng':
					return await this.searchSearXNG(optimizedQuery, maxResults);
				case 'brave':
					return await this.searchBrave(optimizedQuery, maxResults);
				case 'yahoo':
					return await this.searchYahoo(optimizedQuery, maxResults);
				case 'yandex':
					return await this.searchYandex(optimizedQuery, maxResults);
				case 'qwant':
					return await this.searchQwant(optimizedQuery, maxResults);
				case 'mojeek':
					return await this.searchMojeek(optimizedQuery, maxResults);
				default:
					console.warn(`[WebSearch] Unknown provider: ${this.config.provider}, defaulting to DuckDuckGo`);
					return await this.searchDuckDuckGo(optimizedQuery, maxResults);
			}
		} catch (error) {
			console.error('[WebSearch] Error:', error);
			// Return mock results for demonstration when actual search fails
			return this.getMockResults(userInput);
		}
	}

	/**
	 * Search using Google Custom Search API
	 */
	private async searchGoogle(query: string, maxResults: number): Promise<WebSearchResult[]> {
		if (!this.config.apiKey) {
			throw new Error('Google API key is required for Google search');
		}
		
		if (!this.config.googleCseId) {
			throw new Error('Google Custom Search Engine ID is required for Google search');
		}

		const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${this.config.apiKey}&cx=${this.config.googleCseId}&q=${encodeURIComponent(query)}&num=${Math.min(maxResults, 10)}&lr=${this.config.searchLanguage || 'lang_en'}`;
		
		try {
			const response = await requestUrl({
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
	private async searchBing(query: string, maxResults: number): Promise<WebSearchResult[]> {
		if (!this.config.apiKey) {
			throw new Error('Bing API key is required for Bing search');
		}

		const searchUrl = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=${Math.min(maxResults, 50)}&mkt=${this.config.searchCountry || 'en-US'}&setLang=${this.config.searchLanguage || 'en'}`;
		
		try {
			const response = await requestUrl({
				url: searchUrl,
				method: 'GET',
				headers: {
					'Ocp-Apim-Subscription-Key': this.config.apiKey
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
	 * Search using DuckDuckGo HTML scraping
	 */
	private async searchDuckDuckGo(query: string, maxResults: number): Promise<WebSearchResult[]> {
		try {
			// Use DuckDuckGo HTML scraping approach (no API key required)
			const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=${this.config.searchCountry || 'us-en'}`;
			
			const response = await requestUrl({
				url: searchUrl,
				method: 'GET',
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
				}
			});

			if (response.status !== 200) {
				throw new Error(`DuckDuckGo search failed: ${response.status}`);
			}

			const html = response.text;
			const results = this.parseDuckDuckGoHTML(html, maxResults);

			console.debug(`[WebSearch] DuckDuckGo found ${results.length} results`);
			return results;
		} catch (error) {
			console.error('[WebSearch] DuckDuckGo search error:', error);
			throw error;
		}
	}

	/**
	 * Parse DuckDuckGo HTML results
	 * Note: This is fragile and may break if DDG changes their HTML structure
	 */
	private parseDuckDuckGoHTML(html: string, maxResults: number): WebSearchResult[] {
		const results: WebSearchResult[] = [];

		try {
			// Look for result containers in DDG HTML
			const doc = new DOMParser().parseFromString(html, 'text/html');
			const resultElements = doc.querySelectorAll('.result');

			for (let i = 0; i < resultElements.length && results.length < maxResults; i++) {
				const result = resultElements[i];
				const titleElement = result.querySelector('.result__a');
				const snippetElement = result.querySelector('.result__snippet') || result.querySelector('.result__extract');
				const urlElement = result.querySelector('.result__url');

				if (titleElement && titleElement.textContent?.trim()) {
					const title = titleElement.textContent.trim();
					const url = urlElement ? urlElement.textContent?.trim() : (titleElement as HTMLAnchorElement).href;
					const snippet = snippetElement ? snippetElement.textContent?.trim() : 'No description available';

					if (url) {
						results.push({
							title,
							url: url.startsWith('http') ? url : `https://${url}`,
							snippet: snippet || 'No description available',
							source: new URL(url.startsWith('http') ? url : `https://${url}`).hostname
						});
					}
				}
			}
		} catch (error) {
			console.error('[WebSearch] Parsing error:', error);
		}

		return results;
	}

	/**
	 * Search using SerpAPI
	 */
	private async searchSerpAPI(query: string, maxResults: number): Promise<WebSearchResult[]> {
		if (!this.config.apiKey) {
			throw new Error('SerpAPI key is required for SerpAPI search');
		}

		const params = new URLSearchParams({
			q: query,
			hl: this.config.searchLanguage || 'en',
			gl: this.config.searchCountry || 'us',
			num: Math.min(maxResults, 100).toString(),
			api_key: this.config.apiKey
		});

		if (this.config.includeDomains) {
			params.append('site', this.config.includeDomains.split(',')[0].trim()); // SerpAPI supports only one site filter
		}

		if (this.config.timeRange && this.config.timeRange !== 'any') {
			params.append('tbs', `qdr:${this.config.timeRange}`);
		}

		const endpoint = this.config.serpapiEndpoint || 'https://serpapi.com/search';
		const searchUrl = `${endpoint}?${params.toString()}`;
		
		try {
			const response = await requestUrl({
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
	private async searchTavily(query: string, maxResults: number): Promise<WebSearchResult[]> {
		const apiKey = this.config.tavilyApiKey || this.config.apiKey;
		if (!apiKey) {
			throw new Error('Tavily API key is required for Tavily search');
		}

		try {
			const response = await requestUrl({
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

			const data = response.json as BraveSearchResponse;
			const results: WebSearchResult[] = [];

			if (data.results && Array.isArray(data.results)) {
				for (const item of data.results) {
					results.push({
						title: item.title,
						url: item.url,
						snippet: item.content || item.snippet || 'No description available',
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
	private async searchSearXNG(query: string, maxResults: number): Promise<WebSearchResult[]> {
		if (!this.config.searxngEndpoint) {
			throw new Error('SearXNG endpoint is required for SearXNG search');
		}

		const params = new URLSearchParams({
			q: query,
			limit: Math.min(maxResults, 20).toString(),
			language: this.config.searchLanguage || 'en',
			safesearch: '0' // Disable safe search
		});

		if (this.config.timeRange && this.config.timeRange !== 'any') {
			params.append('time_range', this.config.timeRange);
		}

		const searchUrl = `${this.config.searxngEndpoint}?${params.toString()}`;
		
		try {
			const response = await requestUrl({
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
	private async searchBrave(query: string, maxResults: number): Promise<WebSearchResult[]> {
		if (!this.config.apiKey && !this.config.braveApiKey) {
			throw new Error('Brave API key is required for Brave search');
		}

		const apiKey = this.config.braveApiKey || this.config.apiKey;
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

		if (this.config.searchLanguage) {
			params.append('country', this.config.searchCountry || 'US');
			headers['Accept-Language'] = this.config.searchLanguage;
		}

		if (this.config.includeDomains) {
			params.append('domain', this.config.includeDomains.split(',')[0].trim());
		}

		if (this.config.excludeDomains) {
			// Brave doesn't have a direct exclude parameter, so we'll filter results
		}

		const searchUrl = `https://api.search.brave.com/res/v1/web/search?${params.toString()}`;
		
		try {
			const response = await requestUrl({
				url: searchUrl,
				method: 'GET',
				headers: headers
			});

			if (response.status !== 200) {
				throw new Error(`Brave search failed: ${response.status}`);
			}

			const data = response.json as KagiSearchResponse;
			const results: WebSearchResult[] = [];

			if (data.web && Array.isArray(data.web)) {
				for (const item of data.web) {
					results.push({
						title: item.title,
						url: item.url,
						snippet: item.description || item.snippet || 'No description available',
						source: item.domain || new URL(item.url).hostname
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
	 * Search using Yahoo Search (HTML scraping approach)
	 */
	private async searchYahoo(query: string, maxResults: number): Promise<WebSearchResult[]> {
		// Note: Yahoo doesn't provide a free public API, so we'll use HTML scraping
		// This approach is fragile and subject to change
		try {
			const searchUrl = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}&n=${maxResults}&b=${this.config.searchCountry || 'us'}`;
			
			const response = await requestUrl({
				url: searchUrl,
				method: 'GET',
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
				}
			});

			if (response.status !== 200) {
				throw new Error(`Yahoo search failed: ${response.status}`);
			}

			const html = response.text;
			const results = this.parseYahooHTML(html, maxResults);

			console.debug(`[WebSearch] Yahoo found ${results.length} results`);
			return results;
		} catch (error) {
			console.error('[WebSearch] Yahoo search error:', error);
			throw error;
		}
	}

	/**
	 * Parse Yahoo HTML results
	 */
	private parseYahooHTML(html: string, maxResults: number): WebSearchResult[] {
		const results: WebSearchResult[] = [];

		try {
			const doc = new DOMParser().parseFromString(html, 'text/html');
			// Yahoo uses multiple possible selectors for search results
			const resultElements = doc.querySelectorAll('div#web > ol#r1-0 li > div, .dd .mw');

			for (let i = 0; i < resultElements.length && results.length < maxResults; i++) {
				const result = resultElements[i];
				const titleElement = result.querySelector('h3 > a, .title > a');
				const snippetElement = result.querySelector('p, .compText');
				const urlElement = result.querySelector('h3 > a, .title > a');

				if (titleElement && titleElement.textContent?.trim()) {
					const title = titleElement.textContent.trim();
					const url = urlElement ? (urlElement as HTMLAnchorElement).href : '';
					const snippet = snippetElement ? snippetElement.textContent?.trim() : 'No description available';

					if (url) {
						results.push({
							title,
							url,
							snippet: snippet || 'No description available',
							source: new URL(url).hostname
						});
					}
				}
			}
		} catch (error) {
			console.error('[WebSearch] Yahoo HTML parsing error:', error);
		}

		return results;
	}

	/**
	 * Search using Yandex Search (HTML scraping approach)
	 */
	private async searchYandex(query: string, maxResults: number): Promise<WebSearchResult[]> {
		// Yandex doesn't provide a free public API, so we'll use HTML scraping
		// This approach is fragile and subject to change
		try {
			const searchUrl = `https://yandex.com/search/?text=${encodeURIComponent(query)}&num=${maxResults}`;
			
			const response = await requestUrl({
				url: searchUrl,
				method: 'GET',
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
					'Accept-Language': this.config.searchLanguage || 'en-US,en;q=0.9'
				}
			});

			if (response.status !== 200) {
				throw new Error(`Yandex search failed: ${response.status}`);
			}

			const html = response.text;
			const results = this.parseYandexHTML(html, maxResults);

			console.debug(`[WebSearch] Yandex found ${results.length} results`);
			return results;
		} catch (error) {
			console.error('[WebSearch] Yandex search error:', error);
			throw error;
		}
	}

	/**
	 * Parse Yandex HTML results
	 */
	private parseYandexHTML(html: string, maxResults: number): WebSearchResult[] {
		const results: WebSearchResult[] = [];

		try {
			const doc = new DOMParser().parseFromString(html, 'text/html');
			const resultElements = doc.querySelectorAll('li.serp-item, .serp-item div.CachedPage, .OrganicTitle');

			for (let i = 0; i < resultElements.length && results.length < maxResults; i++) {
				const result = resultElements[i];
				const titleElement = result.querySelector('.OrganicTitle, .Link, a.Titles');
				const snippetElement = result.querySelector('.OrganicText, .text-container, .res-desc');
				const urlElement = result.querySelector('.Link');

				if (titleElement && titleElement.textContent?.trim()) {
					const title = titleElement.textContent.trim();
					const url = urlElement ? (urlElement as HTMLAnchorElement).href : '';
					const snippet = snippetElement ? snippetElement.textContent?.trim() : 'No description available';

					if (url) {
						results.push({
							title,
							url: url.startsWith('http') ? url : `https://yandex.com${url}`,
							snippet: snippet || 'No description available',
							source: new URL(url.startsWith('http') ? url : `https://yandex.com${url}`).hostname
						});
					}
				}
			}
		} catch (error) {
			console.error('[WebSearch] Yandex HTML parsing error:', error);
		}

		return results;
	}

	/**
	 * Search using Qwant API
	 */
	private async searchQwant(query: string, maxResults: number): Promise<WebSearchResult[]> {
		const params = new URLSearchParams({
			q: query,
			count: maxResults.toString(),
			t: 'web', // Type: web, news, images, videos
			safesearch: '0' // Disable safe search
		});

		if (this.config.searchLanguage) {
			params.append('locale', this.config.searchLanguage);
		}

		const headers: Record<string, string> = {
			'Accept': 'application/json',
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
		};

		// Add API key to headers if provided
		if (this.config.qwantApiKey) {
			headers['Authorization'] = `Bearer ${this.config.qwantApiKey}`;
		}

		const searchUrl = `https://api.qwant.com/api/search/web?${params.toString()}`;
		
		try {
			const response = await requestUrl({
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
	private async searchMojeek(query: string, maxResults: number): Promise<WebSearchResult[]> {
		if (!this.config.mojeekApiKey) {
			throw new Error('Mojeek API key is required for Mojeek search');
		}

		const params = new URLSearchParams({
			q: query,
			format: 'json',
			num: Math.min(maxResults, 100).toString(),  // Mojeek supports up to 100 results
			ob: '0', // Order by relevance
			t: 'web'  // Type of search
		});

		if (this.config.searchCountry) {
			params.append('country', this.config.searchCountry);
		}

		if (this.config.searchLanguage) {
			params.append('language', this.config.searchLanguage);
		}

		if (this.config.timeRange && this.config.timeRange !== 'any') {
			params.append('date', this.config.timeRange);
		}

		const searchUrl = `https://api.mojeek.com/api/search?${params.toString()}`;
		
		try {
			const response = await requestUrl({
				url: searchUrl,
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${this.config.mojeekApiKey}`,
					'User-Agent': 'Obsidian-Intelligence-Assistant/1.0'
				}
			});

			if (response.status !== 200) {
				throw new Error(`Mojeek search failed: ${response.status}`);
			}

			const data = response.json as JinaSearchResponse;
			const results: WebSearchResult[] = [];

			if (data.results && Array.isArray(data.results)) {
				for (const item of data.results) {
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

	/**
	 * Strip HTML tags from string
	 */
	private stripHTML(html: string): string {
		return html
			.replace(/<[^>]*>/g, '')
			.replace(/&nbsp;/g, ' ')
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.trim();
	}

	/**
	 * Decode HTML entities
	 */
	private decodeHTMLEntities(text: string): string {
		return text
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'");
	}

	/**
	 * Get mock results for demonstration when actual search fails
	 */
	private getMockResults(originalQuery: string): WebSearchResult[] {
		return [
			{
				title: `Search results for "${originalQuery}"`,
				url: `https://duckduckgo.com/?q=${encodeURIComponent(originalQuery)}`,
				snippet: 'Web search is enabled but results could not be fetched. This is a placeholder result. Click to open DuckDuckGo search.',
				source: 'duckduckgo.com'
			}
		];
	}

	/**
	 * Format search results as context string for LLM
	 */
	formatResultsAsContext(results: WebSearchResult[]): string {
		if (results.length === 0) {
			return '';
		}

		let context = 'Web Search Results:\n\n';

		results.forEach((result, index) => {
			context += `${index + 1}. ${result.title}\n`;
			context += `   Source: ${result.source || result.url}\n`;
			context += `   ${result.snippet}\n`;
			if (result.date) {
				context += `   Date: ${result.date}\n`;
			}
			context += `   URL: ${result.url}\n\n`;
		});

		return context;
	}
}
