import type { Agent } from '@/features/agent/types/agent';
import type { RegisteredTool, ToolRegistry } from '@/features/tools';
import { resolveExecutionPolicy } from './execution-policy';
import { t } from '@/i18n';

export interface CapabilityReference {
	type: 'file' | 'folder';
	path: string;
	name: string;
}

export interface CapabilityToolSummary {
	name: string;
	description: string;
	source: string;
	sideEffect: 'none' | 'vault-write-proposal' | 'external-write' | 'local-process';
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
		: t('capability.chatMode');

	const permissions: CapabilityPermissionRow[] = [
		{
			label: t('capability.rows.vaultContext'),
			value: references.length > 0
				? t('capability.rows.referencesPlusContext', { count: references.length })
				: t('capability.rows.activeContext'),
			tone: 'allow',
		},
		{
			label: t('capability.rows.readTools'),
			value: vaultReadToolCount > 0 ? t('capability.rows.enabledCount', { count: vaultReadToolCount }) : t('capability.rows.noReadTool'),
			tone: vaultReadToolCount > 0 ? 'allow' : 'muted',
		},
		{
			label: t('capability.rows.writes'),
			value: vaultWriteProposalToolCount > 0
				? t(resolveExecutionPolicy(input.agent).autonomousWrite ? 'capability.rows.autonomousWrites' : 'capability.rows.proposalOnly')
				: t('capability.rows.unavailable'),
			tone: vaultWriteProposalToolCount > 0 ? 'warn' : 'muted',
		},
		{
			label: t('capability.rows.rag'),
			value: rowState(input.ragConfigured, input.ragActive),
			tone: input.ragConfigured && input.ragActive ? 'allow' : 'muted',
		},
		{
			label: t('capability.rows.web'),
			value: rowState(input.webSearchConfigured, input.webSearchActive),
			tone: input.webSearchConfigured && input.webSearchActive ? 'allow' : 'muted',
		},
		{
			label: t('capability.rows.custom'),
			value: customToolCount > 0 ? t('capability.rows.customEnabled', { count: customToolCount }) : t('capability.rows.noneEnabled'),
			tone: customToolCount > 0 ? 'warn' : 'muted',
		},
		{
			label: t('capability.rows.destructive'),
			value: t('capability.rows.notProvided'),
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
			autonomousWrite: resolveExecutionPolicy(input.agent).autonomousWrite,
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
		description: tool.definition.description || t('capability.noDescription'),
		source: formatToolSource(tool),
		sideEffect: sideEffectOf(tool),
	};
}

function sideEffectOf(tool: RegisteredTool): CapabilityToolSummary['sideEffect'] {
	const effects = tool.definition.sideEffects;
	if (effects?.externalWrite) return 'external-write';
	if (effects?.process) return 'local-process';
	if (effects?.vaultWrite) return 'vault-write-proposal';
	return 'none';
}

function isBuiltinReadTool(tool: RegisteredTool): boolean {
	return tool.origin.kind === 'builtin' && BUILTIN_VAULT_READ_TOOLS.has(tool.definition.name);
}

function formatToolSource(tool: RegisteredTool): string {
	switch (tool.origin.kind) {
		case 'builtin':
			return t('capability.builtinGroup');
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
	autonomousWrite: boolean;
	ragConfigured: boolean;
	ragActive: boolean;
	webSearchConfigured: boolean;
	webSearchActive: boolean;
}): string[] {
	return [
		t('chat.preflight.agent', { name: input.agentName }),
		input.references.length > 0
			? t('chat.preflight.reads', { paths: input.references.map(ref => ref.path).join(', ') })
			: t('chat.preflight.readsDefault'),
		t('chat.preflight.tools', { count: input.toolCount }),
		input.vaultWriteProposalToolCount > 0
			? t(input.autonomousWrite ? 'chat.preflight.writesAutonomous' : 'chat.preflight.writesProposal')
			: t('chat.preflight.writesNone'),
		t('chat.preflight.rag', { state: lineState(input.ragConfigured, input.ragActive) }),
		t('chat.preflight.web', { state: lineState(input.webSearchConfigured, input.webSearchActive) }),
	];
}

function rowState(configured: boolean, active: boolean): string {
	if (!configured) return t('capability.rows.disabledInSettings');
	return t(active ? 'capability.rows.on' : 'capability.rows.off');
}

function lineState(configured: boolean, active: boolean): string {
	if (!configured) return t('capability.state.disabled');
	return t(active ? 'capability.state.on' : 'capability.state.off');
}
