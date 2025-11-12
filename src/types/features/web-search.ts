/**
 * Web Search Feature Types
 * Types for web search functionality
 */

export interface WebSearchConfig {
	enabled: boolean;
	provider: string;
	maxResults: number;
	autoTrigger?: boolean; // Whether to auto-trigger web search based on query analysis
	apiKey?: string;
	googleCseId?: string;
	searchLanguage?: string;
	searchCountry?: string;
	includeDomains?: string;
	excludeDomains?: string;
	timeRange?: string;
	serpapiEndpoint?: string;
	tavilyApiKey?: string;
	searxngEndpoint?: string;
	braveApiKey?: string;
	qwantApiKey?: string;
	mojeekApiKey?: string;
}

export interface WebSearchResult {
	title: string;
	url: string;
	snippet: string;
	source?: string;
}
