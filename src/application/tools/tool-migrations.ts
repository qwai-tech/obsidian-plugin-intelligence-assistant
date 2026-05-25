/**
 * Agent tool-config migration.
 * Phase 3 wrote the migration from the 5 legacy per-agent tool fields into
 * AgentToolAccess. Phase 5/6 removed the legacy fields from the Agent type;
 * this module reads them off `unknown`-shaped JSON via a narrow LegacyAgent
 * accessor so the rest of the codebase doesn't need to know they ever existed.
 */
import type { Agent } from '@/types/core/agent';

/**
 * The legacy fields the migration consumes. Lives only here because the
 * Agent type no longer carries them; older settings/agent JSON still does.
 */
interface LegacyAgentFields {
	enabledBuiltInTools?: string[];
	enabledMcpServers?: string[];
	enabledMcpTools?: string[];
	enabledCLITools?: string[];
	enabledAllCLITools?: boolean;
}

/**
 * Migrate a single agent's legacy tool fields into toolAccess.
 * Idempotent: returns early if toolAccess already exists.
 * Mutates the agent in place and deletes the legacy fields if they were
 * present, so subsequent saves persist only the new schema.
 */
export function migrateAgentToolAccess(
	agent: Agent,
	allCliToolIds: string[],
): boolean {
	if (agent.toolAccess) {
		return false;
	}

	// Narrow to the legacy shape — the Agent type no longer declares these.
	const legacy = agent as Agent & LegacyAgentFields;
	const sources: Record<string, 'all' | string[]> = {};
	const enabledBuiltInTools = legacy.enabledBuiltInTools ?? [];
	const enabledMcpServers = legacy.enabledMcpServers ?? [];
	const enabledMcpTools = legacy.enabledMcpTools ?? [];

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
	if (legacy.enabledAllCLITools) {
		for (const cliId of allCliToolIds) {
			sources[`cli:${cliId}`] = 'all';
		}
	}
	if (legacy.enabledCLITools && legacy.enabledCLITools.length > 0) {
		for (const cliId of legacy.enabledCLITools) {
			if (!sources[`cli:${cliId}`]) {
				sources[`cli:${cliId}`] = 'all';
			}
		}
	}

	agent.toolAccess = { sources };
	// Strip the legacy fields so they don't get re-persisted by callers
	// that round-trip the agent through saveSettings / agentRepository.
	delete legacy.enabledBuiltInTools;
	delete legacy.enabledMcpServers;
	delete legacy.enabledMcpTools;
	delete legacy.enabledCLITools;
	delete legacy.enabledAllCLITools;
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
