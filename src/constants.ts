/**
 * Application-wide constants and configuration values
 */

// Plugin Information
export const PLUGIN_VERSION = '0.0.1';
export const PLUGIN_NAME = 'Intelligence Assistant';

// Plugin Paths
// NOTE: These paths use vault.configDir at runtime to support custom config directories
// For backward compatibility, they default to the standard structure
const PLUGIN_FOLDER_NAME = 'plugins/intelligence-assistant';
export const PLUGIN_BASE_FOLDER = `.obsidian/${PLUGIN_FOLDER_NAME}`;
export const USER_CONFIG_FOLDER = `${PLUGIN_BASE_FOLDER}/config/user`;
export const USER_CONFIG_PATH = `${USER_CONFIG_FOLDER}/settings.json`;
export const DATA_FOLDER = `${PLUGIN_BASE_FOLDER}/data`;
export const CONVERSATIONS_DATA_FOLDER = `${DATA_FOLDER}/conversations`;
export const PROMPTS_DATA_FOLDER = `${DATA_FOLDER}/prompts`;
export const AGENTS_DATA_FOLDER = `${DATA_FOLDER}/agents`;
export const VECTOR_STORE_FOLDER = `${DATA_FOLDER}/vector_store`;
export const VECTOR_STORE_NOTES_PATH = `${VECTOR_STORE_FOLDER}/notes.json`;
export const CACHE_DATA_FOLDER = `${DATA_FOLDER}/cache`;
export const LLM_MODEL_CACHE_PATH = `${CACHE_DATA_FOLDER}/llm_models.json`;
export const LLM_PROVIDERS_PATH = `${DATA_FOLDER}/llm-providers.json`;
export const MCP_SERVERS_PATH = `${DATA_FOLDER}/mcp-servers.json`;
export const MCP_TOOLS_CACHE_FOLDER = `${CACHE_DATA_FOLDER}/mcp-tools`;

/**
 * Get plugin paths using vault's config directory
 * This ensures compatibility with custom config directory setups
 */
export function getPluginPaths(configDir: string) {
	const baseFolder = `${configDir}/${PLUGIN_FOLDER_NAME}`;
	const dataFolder = `${baseFolder}/data`;
	const cacheFolder = `${dataFolder}/cache`;
	const configFolder = `${baseFolder}/config/user`;

	return {
		PLUGIN_BASE_FOLDER: baseFolder,
		USER_CONFIG_FOLDER: configFolder,
		USER_CONFIG_PATH: `${configFolder}/settings.json`,
		DATA_FOLDER: dataFolder,
		CONVERSATIONS_DATA_FOLDER: `${dataFolder}/conversations`,
		PROMPTS_DATA_FOLDER: `${dataFolder}/prompts`,
		AGENTS_DATA_FOLDER: `${dataFolder}/agents`,
		VECTOR_STORE_FOLDER: `${dataFolder}/vector_store`,
		VECTOR_STORE_NOTES_PATH: `${dataFolder}/vector_store/notes.json`,
		CACHE_DATA_FOLDER: cacheFolder,
		LLM_MODEL_CACHE_PATH: `${cacheFolder}/llm_models.json`,
		LLM_PROVIDERS_PATH: `${dataFolder}/llm-providers.json`,
		MCP_SERVERS_PATH: `${dataFolder}/mcp-servers.json`,
		MCP_TOOLS_CACHE_FOLDER: `${cacheFolder}/mcp-tools`,
	};
}

// Default Agent
export const DEFAULT_AGENT_ID = 'builtin-generalist-agent';



// View Types
export const VIEW_TYPES = {
	CHAT: 'chat-view',
} as const;

// Default Model Configuration
export const DEFAULT_MODEL_CONFIG = {
	FALLBACK_MODEL: 'gpt-4o',
	TEMPERATURE: 0.7,
	MAX_TOKENS: 2000,
	CONTEXT_WINDOW: 20,
} as const;

// Memory Configuration
export const DEFAULT_MEMORY_CONFIG = {
	SUMMARY_INTERVAL: 10,
	MAX_MEMORIES: 50,
} as const;

// ReAct Configuration
export const DEFAULT_REACT_CONFIG = {
	MAX_STEPS: 10,
	AUTO_CONTINUE: true,
} as const;

// UI Constants
export const UI_CONSTANTS = {
	TABLE_HEADER_CLASS: 'ia-table-header',
	TABLE_ROW_CLASS: 'ia-table-row',
	TABLE_CELL_CLASS: 'ia-table-cell',
	STATUS_CLASS_PREFIX: 'is-',
} as const;

// Status Types
export type StatusType = 'success' | 'warning' | 'error' | 'info';

// Export type helpers
export type ViewType = typeof VIEW_TYPES[keyof typeof VIEW_TYPES];
