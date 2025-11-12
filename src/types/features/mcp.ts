/**
 * MCP Feature Types
 * Types for Model Context Protocol
 */

export type MCPConnectionMode = 'auto' | 'manual';

export interface CachedMCPTool {
	name: string;
	description?: string;
	inputSchema?: {
		type: 'object';
		properties?: Record<string, any>;
		required?: string[];
	};
}

export interface MCPServerConfig {
	name: string;
	command: string;
	args?: string[];
	env?: Record<string, string>;
	enabled: boolean;
	connectionMode?: MCPConnectionMode;
	cachedTools?: CachedMCPTool[];
	cacheTimestamp?: number;
}

export interface MCPRegistry {
	name: string;
	url: string;
	enabled: boolean;
}
