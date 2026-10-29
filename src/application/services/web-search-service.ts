import { htmlToMarkdown } from 'obsidian';
import type { HttpPort } from '@qwai/obsidian-llm';
import type { WebSearchConfig } from '@/types';
import { SEARCH_BACKENDS } from './web-search/backends';
import { optimizeQuery, preprocessQuery, shouldSearch } from './web-search/query-heuristics';

/** True when the string looks like it contains HTML markup worth converting. */
function looksLikeHtml(text: string): boolean {
	return /<[a-z!/][^>]*>|&[a-z#0-9]+;/i.test(text);
}

/**
 * Convert a possibly-HTML search snippet into clean markdown. Many providers
 * (Bing, SerpAPI, Brave, Google) return snippets with <b>/<strong> highlight
 * tags and HTML entities; Obsidian's htmlToMarkdown gives us a faithful,
 * reader-friendly conversion instead of leaving raw tags in the agent context.
 */
export function snippetToMarkdown(snippet: string): string {
	if (!snippet) return snippet;
	if (!looksLikeHtml(snippet)) return snippet;
	const md = htmlToMarkdown(snippet);
	const trimmed = md.trim();
	return trimmed.length > 0 ? trimmed : snippet;
}

export interface WebSearchResult {
	title: string;
	url: string;
	snippet: string;
	source?: string;
	image?: string; // For image results
	date?: string; // For news results
}

// API Response Type Interfaces
export class WebSearchService {
	constructor(private readonly getConfig: () => WebSearchConfig, private readonly httpClient: HttpPort) {}

	private get config(): WebSearchConfig {
		return this.getConfig();
	}

	/**
	 * Search the web using configured provider
	 */
	async search(userInput: string): Promise<WebSearchResult[]> {
		try {
			// Preprocess the user input
			const processedQuery = preprocessQuery(userInput);
			
			if (!processedQuery) {
				console.debug('[WebSearch] Query was filtered out or is too short');
				return []; // Return empty results if query is not valid
			}

			// Determine if this query would benefit from web search
			if (!shouldSearch(processedQuery)) {
				console.debug('[WebSearch] Query does not seem to require web search, skipping');
				return []; // Return empty results if search is not appropriate
			}

			// Optimize the query for better search results
			const optimizedQuery = optimizeQuery(processedQuery);

			console.debug(`[WebSearch] Searching for: "${optimizedQuery}" using provider: ${this.config.provider}`);

			const maxResults = this.config.maxResults || 5;
			
			const backend = SEARCH_BACKENDS[this.config.provider];
			if (!backend) {
				console.warn(`[WebSearch] Unknown provider: ${this.config.provider}`);
				return [];
			}
			const results = await backend(optimizedQuery, maxResults, { config: this.config, http: this.httpClient });

			return this.applyDomainFilters(this.cleanResultSnippets(results));
		} catch (error) {
			console.error('[WebSearch] Error:', error);
			return [];
		}
	}

	/**
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
	 * Normalize each result's snippet from provider HTML to clean markdown via
	 * Obsidian's htmlToMarkdown, so HTML highlight tags / entities never reach
	 * the agent context. Plain-text snippets pass through untouched.
	 */
	private cleanResultSnippets(results: WebSearchResult[]): WebSearchResult[] {
		return results.map(result => {
			const snippet = snippetToMarkdown(result.snippet);
			return snippet === result.snippet ? result : { ...result, snippet };
		});
	}

	private applyDomainFilters(results: WebSearchResult[]): WebSearchResult[] {
		if (!results || results.length === 0) {
			return [];
		}

		const includeDomains = this.normalizeDomainList(this.config.includeDomains);
		const excludeDomains = this.normalizeDomainList(this.config.excludeDomains);

		return results.filter(result => {
			const host = this.extractHostname(result.url);
			if (!host) {
				return includeDomains.length === 0;
			}

			if (excludeDomains.length > 0 && excludeDomains.some(domain => this.matchesDomain(host, domain))) {
				return false;
			}

			if (includeDomains.length === 0) {
				return true;
			}

			return includeDomains.some(domain => this.matchesDomain(host, domain));
		});
	}

	private normalizeDomainList(domains?: string): string[] {
		if (!domains) {
			return [];
		}

		return domains
			.split(',')
			.map(domain => domain.trim().toLowerCase())
			.filter(Boolean);
	}

	private extractHostname(url?: string): string | null {
		if (!url) {
			return null;
		}

		try {
			return new URL(url).hostname.toLowerCase();
		} catch (error) {
			console.warn('[WebSearch] Failed to parse URL for filtering', url, error);
			return null;
		}
	}

	private matchesDomain(host: string, domain: string): boolean {
		return host === domain || host.endsWith(`.${domain}`);
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
