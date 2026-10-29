import { CLITool } from '@/application/services/cli-tool';
import { MCPToolWrapper } from '@/application/services/mcp-tool-wrapper';
import { buildAgentCapabilitySummary } from '@/application/agents/agent-capability-summary';
import type { RegisteredTool } from '@/types/common/tools';

const registered = (tool: { definition: RegisteredTool['definition'] }, kind: 'cli' | 'mcp'): RegisteredTool => ({
	toolId: `${kind}:x:${tool.definition.name}`,
	llmName: tool.definition.name,
	origin: { kind, sourceId: 'x' },
	definition: tool.definition,
	execute: jest.fn(),
});

describe('tools that run local processes', () => {
	const cli = new CLITool({ id: 'git', name: 'git_status', description: 'Show git status', command: 'git', enabled: true } as never);
	const mcp = new MCPToolWrapper({ name: 'search', inputSchema: { type: 'object' } }, { getServerName: () => 'web' } as never);

	it('declare the process effect for CLI and MCP tools', () => {
		expect(cli.definition.sideEffects).toEqual({ process: true });
		expect(mcp.definition.sideEffects).toEqual({ process: true });
	});

	it('are reported as process tools in the capability summary', () => {
		const summary = buildAgentCapabilitySummary({
			agent: null,
			tools: [registered(cli, 'cli'), registered(mcp, 'mcp')],
		} as never);

		const tools = summary.toolGroups.flatMap((group) => group.tools);
		expect(tools.map((tool) => tool.sideEffect)).toEqual(['local-process', 'local-process']);
	});
});
