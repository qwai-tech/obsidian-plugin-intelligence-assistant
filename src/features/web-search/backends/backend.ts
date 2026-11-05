import type { HttpPort } from '@qwai/obsidian-llm';
import type { WebSearchConfig } from '@/features/web-search/types/web-search';
import type { WebSearchResult } from '../web-search-service';

export interface BackendContext {
	config: WebSearchConfig;
	http: HttpPort;
	signal?: AbortSignal;
}

export type SearchBackend = (query: string, maxResults: number, context: BackendContext) => Promise<WebSearchResult[]>;
