import type { Agent } from '@/types';
import type { RegisteredTool } from '@/types/common/tools';
import type { ToolRegistry } from '@/application/tools/tool-registry';

export interface CapabilityReference {
	type: 'file' | 'folder';
	path: string;
	name: string;
}

export interface CapabilityToolSummary {
	name: string;
	description: string;
	source: string;
	sideEffect: 'none' | 'vault-write-proposal' | 'external-write';
}

export interface CapabilityToolGroup {
	label: string;
	tools: CapabilityToolSummary[];
}

export interface CapabilityPermissionRow {
	label: string;
	value: string;
	tone: 'allow' | 'warn' | 'deny' | 'muted';
}

export interface AgentCapabilitySummary {
	mode: 'chat' | 'agent';
	agentName: string;
	toolCount: number;
	vaultReadToolCount: number;
	vaultWriteProposalToolCount: number;
	customToolCount: number;
	ragConfigured: boolean;
	ragActive: boolean;
	webSearchConfigured: boolean;
	webSearchActive: boolean;
	references: CapabilityReference[];
	permissions: CapabilityPermissionRow[];
	toolGroups: CapabilityToolGroup[];
	preflightItems: string[];
}

export interface BuildAgentCapabilitySummaryInput {
	mode: 'chat' | 'agent';
	agent: Agent | null;
	tools: RegisteredTool[];
	ragConfigured: boolean;
	ragActive: boolean;
	webSearchConfigured: boolean;
	webSearchActive: boolean;
	references?: CapabilityReference[];
}

const BUILTIN_VAULT_READ_TOOLS = new Set(['read_file', 'list_files', 'search_files']);

export function resolveAgentToolsForAgent(registry: ToolRegistry, agent: Agent | null): RegisteredTool[] {
	if (!agent) return [];
	return registry.resolveForAgent(agent.toolAccess ?? { sources: {} });
}

export function buildAgentCapabilitySummary(input: BuildAgentCapabilitySummaryInput): AgentCapabilitySummary {
	const references = input.references ?? [];
	const toolSummaries = input.tools.map(toCapabilityToolSummary);
	const vaultReadToolCount = input.tools.filter(tool => isBuiltinReadTool(tool)).length;
	const vaultWriteProposalToolCount = input.tools.filter(tool => tool.definition.sideEffects?.vaultWrite).length;
	const customToolCount = input.tools.filter(tool => tool.origin.kind !== 'builtin').length;
	const agentName = input.mode === 'agent'
		? (input.agent?.name || 'Intelligence Assistant')
		: 'Chat mode';

	const permissions: CapabilityPermissionRow[] = [
		{
			label: 'Vault context',
			value: references.length > 0
				? `${references.length} explicit reference${references.length === 1 ? '' : 's'} plus active context`
				: 'Active note and graph context snapshot',
			tone: 'allow',
		},
		{
			label: 'Vault read tools',
			value: vaultReadToolCount > 0 ? `${vaultReadToolCount} enabled` : 'No direct read tool enabled',
			tone: vaultReadToolCount > 0 ? 'allow' : 'muted',
		},
		{
			label: 'Vault writes',
			value: vaultWriteProposalToolCount > 0
				? 'Proposal only; Apply is required'
				: 'Unavailable',
			tone: vaultWriteProposalToolCount > 0 ? 'warn' : 'muted',
		},
		{
			label: 'RAG',
			value: input.ragConfigured ? (input.ragActive ? 'On' : 'Off') : 'Disabled in settings',
			tone: input.ragConfigured && input.ragActive ? 'allow' : 'muted',
		},
		{
			label: 'Web search',
			value: input.webSearchConfigured ? (input.webSearchActive ? 'On' : 'Off') : 'Disabled in settings',
			tone: input.webSearchConfigured && input.webSearchActive ? 'allow' : 'muted',
		},
		{
			label: 'Custom tools',
			value: customToolCount > 0 ? `${customToolCount} MCP/OpenAPI/CLI tool${customToolCount === 1 ? '' : 's'} enabled` : 'None enabled',
			tone: customToolCount > 0 ? 'warn' : 'muted',
		},
		{
			label: 'Destructive vault actions',
			value: 'Not provided by built-in tools',
			tone: 'deny',
		},
	];

	return {
		mode: input.mode,
		agentName,
		toolCount: input.tools.length,
		vaultReadToolCount,
		vaultWriteProposalToolCount,
		customToolCount,
		ragConfigured: input.ragConfigured,
		ragActive: input.ragActive,
		webSearchConfigured: input.webSearchConfigured,
		webSearchActive: input.webSearchActive,
		references,
		permissions,
		toolGroups: groupTools(toolSummaries),
		preflightItems: buildPreflightItems({
			agentName,
			toolCount: input.tools.length,
			references,
			vaultWriteProposalToolCount,
			ragConfigured: input.ragConfigured,
			ragActive: input.ragActive,
			webSearchConfigured: input.webSearchConfigured,
			webSearchActive: input.webSearchActive,
		}),
	};
}

function toCapabilityToolSummary(tool: RegisteredTool): CapabilityToolSummary {
	return {
		name: tool.llmName,
		description: tool.definition.description || 'No description',
		source: formatToolSource(tool),
		sideEffect: tool.definition.sideEffects?.externalWrite
			? 'external-write'
			: tool.definition.sideEffects?.vaultWrite
				? 'vault-write-proposal'
				: 'none',
	};
}

function isBuiltinReadTool(tool: RegisteredTool): boolean {
	return tool.origin.kind === 'builtin' && BUILTIN_VAULT_READ_TOOLS.has(tool.definition.name);
}

function formatToolSource(tool: RegisteredTool): string {
	switch (tool.origin.kind) {
		case 'builtin':
			return 'Built-in vault tools';
		case 'mcp':
			return `MCP: ${tool.origin.sourceId}`;
		case 'openapi':
			return `HTTP / OpenAPI: ${tool.origin.sourceId}`;
		case 'cli':
			return `CLI: ${tool.origin.sourceId}`;
	}
}

function groupTools(tools: CapabilityToolSummary[]): CapabilityToolGroup[] {
	const groups = new Map<string, CapabilityToolSummary[]>();
	for (const tool of tools) {
		const existing = groups.get(tool.source) ?? [];
		existing.push(tool);
		groups.set(tool.source, existing);
	}
	return Array.from(groups.entries()).map(([label, groupTools]) => ({
		label,
		tools: groupTools.sort((a, b) => a.name.localeCompare(b.name)),
	}));
}

function buildPreflightItems(input: {
	agentName: string;
	toolCount: number;
	references: CapabilityReference[];
	vaultWriteProposalToolCount: number;
	ragConfigured: boolean;
	ragActive: boolean;
	webSearchConfigured: boolean;
	webSearchActive: boolean;
}): string[] {
	return [
		`Agent: ${input.agentName}`,
		input.references.length > 0
			? `Reads: ${input.references.map(ref => ref.path).join(', ')}`
			: 'Reads: active note and context snapshot',
		`Tools: ${input.toolCount} enabled`,
		input.vaultWriteProposalToolCount > 0
			? 'Writes: proposal only; Apply required'
			: 'Writes: unavailable',
		`RAG: ${input.ragConfigured ? (input.ragActive ? 'on' : 'off') : 'disabled'}`,
		`Web: ${input.webSearchConfigured ? (input.webSearchActive ? 'on' : 'off') : 'disabled'}`,
	];
}
