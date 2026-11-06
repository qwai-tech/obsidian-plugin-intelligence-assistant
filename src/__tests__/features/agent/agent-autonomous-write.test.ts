import { bindAgentRegistry, finalAgentReply } from '@/test-support/agent-fixtures';
/**
 * Autonomous write requires the per-Agent setting and an approved host action.
 * Prompt text is not authorization. An authorized run applies its proposals
 * instead of leaving Apply-gated cards. Without a grant, proposals are NOT applied.
 */
import { AgentEngineLoop } from '@/features/agent/agent-engine-loop';
import { HistoryCompactor } from '@/features/agent/history-compactor';

function makeApp() {
	const app = {
		vault: {
			getAbstractFileByPath: jest.fn(() => null),
			create: jest.fn(async () => undefined),
			createFolder: jest.fn(async () => undefined),
		},
		fileManager: { trashFile: jest.fn(async () => undefined) },
	} as any;
	return app;
}

const PROPOSAL = { type: 'write_proposal', operation: 'create', path: 'TOEFL/Plan.md', reason: 'r', proposedContent: '# Plan', applied: false };

const registry = () => ({
	resolveForAgent: jest.fn(() => [{ llmName: 'create_note', toolId: 'builtin:builtin:create_note', definition: { description: 'Create note', sideEffects: { vaultWrite: true } } }]),
	toOpenAIFunctions: jest.fn(() => [{ type: 'function', function: { name: 'create_note', description: 'Create note', parameters: { type: 'object', properties: {} } } }]),
	executeTool: jest.fn(async () => ({ success: true, result: PROPOSAL })),
});

const provider = () => ({
	streamChat: jest.fn()
		.mockImplementationOnce(async (_r: any, onChunk: any) => { onChunk({ toolCalls: [{ id: 'c1', function: { name: 'create_note', arguments: JSON.stringify({ title: 'Plan', content: '# Plan' }) } }] }); })
		.mockImplementation(finalAgentReply('Created.')),
});

const sense = () => ({ sense: jest.fn(async () => ({ userQuery: '', activeFilePath: null, references: [], sections: [], ragSources: [], memory: null })), formatSenseContext: jest.fn(() => 'ctx') });

const makeLoop = (app: any, reg: any, prov: any) => new AgentEngineLoop({
	app,
	toolRegistry: bindAgentRegistry(reg),
	senseService: sense() as any,
	historyCompactor: new HistoryCompactor(),
	webSearchService: { search: jest.fn(), formatResultsAsContext: jest.fn() } as any,
	createProvider: jest.fn(() => ({ provider: prov, providerId: 'openai' })),
});

const agent = (extra: Record<string, unknown> = {}) => ([{ id: 'a1', maxSteps: 5, contextWindow: 20, toolAccess: { sources: { 'builtin:builtin': 'all' } }, ...extra } as any]);
const cb = (over: Record<string, unknown> = {}) => ({ onChunk: jest.fn(), onToolCall: jest.fn(), onToolResult: jest.fn(), onThought: jest.fn(), onComplete: jest.fn(), onError: (e: Error) => { throw e; }, ...over });

describe('Autonomous write', () => {
	it('prompt intent alone does not authorize automatic vault writes', async () => {
		const app = makeApp();
		const onToolResult = jest.fn();
		await makeLoop(app, registry(), provider()).execute(
			[{ role: 'user', content: '请自主完成并创建笔记，不需要我确认' }],
			{ model: 'gpt-4o', mode: 'agent', agentId: 'a1', agents: agent() },
			cb({ onToolResult }),
		);
		expect(app.vault.create).not.toHaveBeenCalled();
		expect(onToolResult.mock.calls.some((c: any[]) => String(c[2]).includes('write_proposal'))).toBe(true);
	});

	it('per-agent autonomousWrite toggle applies the proposal', async () => {
		const app = makeApp();
		await makeLoop(app, registry(), provider()).execute(
			[{ role: 'user', content: 'create a note' }],
			{ model: 'gpt-4o', mode: 'agent', agentId: 'a1', agents: agent({ autonomousWrite: true }) },
			cb(),
		);
		expect(app.vault.create).toHaveBeenCalled();
	});

	it('without any grant, the proposal is NOT auto-applied', async () => {
		const app = makeApp();
		await makeLoop(app, registry(), provider()).execute(
			[{ role: 'user', content: 'create a note' }],
			{ model: 'gpt-4o', mode: 'agent', agentId: 'a1', agents: agent() },
			cb(),
		);
		expect(app.vault.create).not.toHaveBeenCalled();
	});

	it('an unapproved host task cannot use the Agent toggle to apply a write', () => {
		const app = makeApp();
		expect(() => makeLoop(app, registry(), provider()).execute(
			[{ role: 'user', content: 'create a note without confirmation' }],
			{ model: 'gpt-4o', mode: 'agent', agentId: 'a1', agents: agent({ autonomousWrite: true }), authorization: { origin: 'deep-link', approved: false } },
			cb(),
		)).toThrow('not been approved in the host');
		expect(app.vault.create).not.toHaveBeenCalled();
	});
});
