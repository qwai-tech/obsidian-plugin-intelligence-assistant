/**
 * Agent tool-config migration.
 * Phase 3: migrates the 5 legacy per-agent tool fields into AgentToolAccess.
 */
import type { Agent } from '@/types/core/agent';

/**
 * Migrate a single agent's legacy tool fields into toolAccess.
 * Idempotent: returns early if toolAccess already exists.
 * Mutates the agent in place.
 */
export function migrateAgentToolAccess(
	agent: Agent,
	allCliToolIds: string[],
): boolean {
	if (agent.toolAccess) {
		return false;
	}

	const sources: Record<string, 'all' | string[]> = {};
	const enabledBuiltInTools = agent.enabledBuiltInTools ?? [];
	const enabledMcpServers = agent.enabledMcpServers ?? [];
	const enabledMcpTools = agent.enabledMcpTools ?? [];

	// Built-in tools: translate names to toolIds
	if (enabledBuiltInTools.length > 0) {
		sources['builtin:builtin'] = enabledBuiltInTools.map(
			(name) => `builtin:builtin:${name}`,
		);
	}

	// MCP servers: each listed server becomes 'all'
	for (const serverName of enabledMcpServers) {
		sources[`mcp:${serverName}`] = 'all';
	}

	// MCP individual tools NOT already covered by enabledMcpServers
	if (enabledMcpTools.length > 0) {
		const toolByServer = new Map<string, string[]>();
		for (const fullKey of enabledMcpTools) {
			const sepIdx = fullKey.indexOf('::');
			if (sepIdx === -1) continue;
			const server = fullKey.substring(0, sepIdx);
			const toolName = fullKey.substring(sepIdx + 2);
			if (!enabledMcpServers.includes(server)) {
				if (!toolByServer.has(server)) {
					toolByServer.set(server, []);
				}
				toolByServer.get(server)!.push(toolName);
			}
		}
		for (const [server, tools] of toolByServer) {
			sources[`mcp:${server}`] = tools.map((t) => `mcp:${server}:${t}`);
		}
	}

	// CLI: enabledAllCLITools -> 'all' for every known CLI config
	if (agent.enabledAllCLITools) {
		for (const cliId of allCliToolIds) {
			sources[`cli:${cliId}`] = 'all';
		}
	}
	if (agent.enabledCLITools && agent.enabledCLITools.length > 0) {
		for (const cliId of agent.enabledCLITools) {
			if (!sources[`cli:${cliId}`]) {
				sources[`cli:${cliId}`] = 'all';
			}
		}
	}

	agent.toolAccess = { sources };
	return true;
}

/**
 * Migrate all agents, returning the set of mutated agent IDs.
 */
export function migrateAllAgents(
	agents: Agent[],
	allCliToolIds: string[],
): Set<string> {
	const changed = new Set<string>();
	for (const agent of agents) {
		if (migrateAgentToolAccess(agent, allCliToolIds)) {
			changed.add(agent.id);
		}
	}
	return changed;
}
