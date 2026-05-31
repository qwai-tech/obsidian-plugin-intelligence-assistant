import {
	buildAgentCapabilitySummary,
	resolveAgentToolsForAgent,
} from '@/application/agents/agent-capability-summary';
import type { Agent } from '@/types';
import type { RegisteredTool } from '@/types/common/tools';

function makeTool(name: string, overrides: Partial<RegisteredTool> = {}): RegisteredTool {
	return {
		toolId: `builtin:builtin:${name}`,
		llmName: name,
		origin: { kind: 'builtin', sourceId: 'builtin' },
		definition: {
			name,
			description: `${name} description`,
			parameters: [],
		},
		execute: jest.fn(),
		...overrides,
	};
}

function makeAgent(): Agent {
	return {
		id: 'agent-1',
		name: 'Knowledge Agent',
		description: '',
		icon: '',
		modelStrategy: { strategy: 'default' },
		temperature: 0.7,
		maxTokens: 2000,
		systemPromptId: 'default',
		contextWindow: 20,
		toolAccess: {
			sources: {
				'builtin:builtin': ['builtin:builtin:read_file'],
			},
		},
		memoryType: 'none',
		memoryConfig: { summaryInterval: 10, maxMemories: 100 },
		ragEnabled: false,
		webSearchEnabled: false,
		maxSteps: 10,
		createdAt: 1,
		updatedAt: 1,
	};
}

describe('agent capability summary', () => {
	it('makes write permissions explicit as proposal-only', () => {
		const summary = buildAgentCapabilitySummary({
			mode: 'agent',
			agent: makeAgent(),
			tools: [
				makeTool('read_file'),
				makeTool('create_note', {
					definition: {
						name: 'create_note',
						description: 'Prepare a proposal to create a note',
						parameters: [],
						sideEffects: { vaultWrite: true },
					},
				}),
			],
			ragConfigured: true,
			ragActive: true,
			webSearchConfigured: true,
			webSearchActive: false,
			references: [{ type: 'folder', path: 'Research', name: 'Research' }],
		});

		expect(summary.agentName).toBe('Knowledge Agent');
		expect(summary.vaultReadToolCount).toBe(1);
		expect(summary.vaultWriteProposalToolCount).toBe(1);
		expect(summary.permissions).toEqual(expect.arrayContaining([
			expect.objectContaining({
				label: 'Vault writes',
				value: 'Proposal only; Apply is required',
				tone: 'warn',
			}),
			expect.objectContaining({
				label: 'Destructive vault actions',
				value: 'Not provided by built-in tools',
				tone: 'deny',
			}),
		]));
		expect(summary.preflightItems).toEqual(expect.arrayContaining([
			'Reads: Research',
			'Writes: proposal only; Apply required',
			'RAG: on',
			'Web: off',
		]));
	});

	it('resolves tools through the active agent instead of task presets', () => {
		const agent = makeAgent();
		const registry = {
			resolveForAgent: jest.fn().mockReturnValue([makeTool('read_file')]),
		};

		const tools = resolveAgentToolsForAgent(registry as never, agent);

		expect(registry.resolveForAgent).toHaveBeenCalledWith(agent.toolAccess);
		expect(tools.map(tool => tool.llmName)).toEqual(['read_file']);
	});
});
