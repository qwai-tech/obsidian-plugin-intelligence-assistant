import type { SearchBackend } from './backends/backend';
import { searchGoogle } from './backends/google';
import { searchBing } from './backends/bing';
import { searchSerpAPI } from './backends/serpapi';
import { searchTavily } from './backends/tavily';
import { searchSearXNG } from './backends/searxng';
import { searchBrave } from './backends/brave';
import { searchQwant } from './backends/qwant';
import { searchMojeek } from './backends/mojeek';

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

export const SEARCH_PROVIDER_IDS = Object.keys(SEARCH_BACKENDS);
