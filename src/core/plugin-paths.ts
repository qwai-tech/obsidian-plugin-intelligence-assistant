export interface PluginPaths {
	base: string;
	userConfig: string;
	data: string;
	conversations: string;
	legacyConversations: string;
	prompts: string;
	agents: string;
	agentRuns: string;
	agentMemoryFolder: string;
	agentMemory: string;
	vectorStoreFolder: string;
	vectorStoreNotes: string;
	cache: string;
	modelCache: string;
	providers: string;
	mcpServers: string;
	mcpToolsCache: string;
	tokenUsage: string;
}

export function pluginPaths(base: string): PluginPaths {
	const data = `${base}/data`;
	const cache = `${data}/cache`;
	const agentMemoryFolder = `${data}/agent-memory`;
	const vectorStoreFolder = `${data}/vector_store`;
	return {
		base,
		userConfig: `${base}/config/user/settings.json`,
		data,
		conversations: `${data}/conversations`,
		legacyConversations: `${base}/.conversation`,
		prompts: `${data}/prompts`,
		agents: `${data}/agents`,
		agentRuns: `${data}/agent-runs`,
		agentMemoryFolder,
		agentMemory: `${agentMemoryFolder}/memory.json`,
		vectorStoreFolder,
		vectorStoreNotes: `${vectorStoreFolder}/notes.json`,
		cache,
		modelCache: `${cache}/llm_models.json`,
		providers: `${data}/llm-providers.json`,
		mcpServers: `${data}/mcp-servers.json`,
		mcpToolsCache: `${cache}/mcp-tools`,
		tokenUsage: `${data}/token-usage.json`,
	};
}
