import { bindAgentRegistry } from '@/test-support/agent-fixtures';
import { RegistryToolRunner } from '@/features/agent/kernel/registry-tool-runner';
import { applyWriteProposal } from '@/features/agent/write-proposal-service';
import type { ToolRegistry } from '@/features/tools/tool-registry';
import type { ToolResult, RegisteredTool } from '@/features/tools/types/tools';

jest.mock('@/features/agent/write-proposal-service', () => {
	const actual = jest.requireActual('@/features/agent/write-proposal-service');
	return { ...actual, applyWriteProposal: jest.fn(async () => undefined) };
});

const proposal = (operation: string, path = 'Notes/a.md') => ({ type: 'write_proposal', operation, path, proposedContent: 'x', applied: false });
const batch = (...operations: string[]) => ({ type: 'batch_proposal', id: 'b1', applied: false, proposals: operations.map((op, i) => proposal(op, `n${i}.md`)) });

const runner = (result: ToolResult, options: { autonomous?: boolean; taskAllowed?: ReadonlySet<string>; bindings?: ReadonlyMap<string, RegisteredTool> } = {}) => {
	const registry = bindAgentRegistry({ resolveForAgent: () => ['read_file', 'write_file'].map(llmName => ({ llmName, toolId: `builtin:builtin:${llmName}`, definition: { description: llmName } })), executeTool: jest.fn(async () => result) }) as unknown as ToolRegistry;
	jest.spyOn(registry, 'executeBoundTool');
	return {
		registry,
		runner: new RegistryToolRunner({
			registry,
			enabled: new Set(['write_file', 'read_file']),
			known: new Set(['write_file', 'read_file', 'delete_file']),
			autonomous: options.autonomous ?? false,
			app: {} as never,
			taskAllowed: options.taskAllowed,
			bindings: options.bindings,
		}),
	};
};

const call = (name: string) => ({ id: 'c1', name, arguments: { path: 'a.md' } });

describe('RegistryToolRunner', () => {
	beforeEach(() => (applyWriteProposal as jest.Mock).mockClear());

	it('returns the serialized result of an enabled tool', async () => {
		const { runner: r, registry } = runner({ success: true, result: { lines: 3 } });

		expect(await r.run(call('read_file'))).toEqual({ ok: true, value: { lines: 3 }, output: '{"lines":3}', proposal: false });
		expect(registry.executeTool).toHaveBeenCalledWith('read_file', { path: 'a.md' });
		expect(registry.executeBoundTool).toHaveBeenCalledWith(registry.getToolByLlmName('read_file'), { path: 'a.md' }, { signal: undefined });
	});

	it('rejects a task-forbidden tool before dispatch even when the Agent enabled it', async () => {
		const { runner: r, registry } = runner({ success: true, result: proposal('create') }, { autonomous: true, taskAllowed: new Set(['read_file']) });
		const outcome = await r.run(call('write_file'));
		expect(outcome).toMatchObject({ ok: false, preflightRejected: true, proposal: false });
		expect(outcome.output).toContain('NOT executed');
		expect(registry.executeBoundTool).not.toHaveBeenCalled();
		expect(applyWriteProposal).not.toHaveBeenCalled();
	});

	it('refuses an enabled tool without a captured binding', async () => {
		const { runner: r, registry } = runner({ success: true, result: 'x' }, { bindings: new Map() });
		expect((await r.run(call('read_file'))).output).toContain('not bound to this task');
		expect(registry.executeBoundTool).not.toHaveBeenCalled();
	});

	it('does not dispatch an already cancelled request', async () => {
		const { runner: r, registry } = runner({ success: true, result: 'x' });
		await expect(r.run(call('read_file'), AbortSignal.abort())).rejects.toThrow();
		expect(registry.executeBoundTool).not.toHaveBeenCalled();
	});

	it('does not apply a returned proposal after cancellation during dispatch', async () => {
		const stop = new AbortController();
		const { runner: r, registry } = runner({ success: true, result: proposal('create') }, { autonomous: true });
		(registry.executeBoundTool as jest.Mock).mockImplementationOnce(async () => {
			stop.abort();
			return { success: true, result: proposal('create') };
		});
		await expect(r.run(call('write_file'), stop.signal)).rejects.toThrow();
		expect(applyWriteProposal).not.toHaveBeenCalled();
	});

	it.each([null, 3, 'read-only value'])('leaves non-proposal values untouched in autonomous mode: %s', async result => {
		const outcome = await runner({ success: true, result }, { autonomous: true }).runner.run(call('read_file'));
		expect(outcome.value).toEqual(result);
		expect(outcome.proposal).toBe(false);
		expect(applyWriteProposal).not.toHaveBeenCalled();
	});

	it('reports a failed tool with its error, or Unknown error when there is none', async () => {
		expect((await runner({ success: false, error: 'disk full' }).runner.run(call('write_file'))).output).toBe('Tool "write_file" failed: disk full');
		expect((await runner({ success: false }).runner.run(call('write_file'))).output).toBe('Tool "write_file" failed: Unknown error');
	});

	it('refuses a known tool the agent may not use, without running it', async () => {
		const { runner: r, registry } = runner({ success: true, result: null });

		expect(await r.run(call('delete_file'))).toEqual({ ok: false, value: null, output: 'Tool "delete_file" is not enabled for this agent', proposal: false });
		expect(registry.executeTool).not.toHaveBeenCalled();
	});

	it('refuses an unknown tool as a recoverable failure', async () => {
		expect((await runner({ success: true, result: null }).runner.run(call('hallucinated'))).output).toBe('Tool "hallucinated" does not exist');
	});

	it('flags a write proposal and leaves it for review by default', async () => {
		const outcome = await runner({ success: true, result: proposal('create') }).runner.run(call('write_file'));

		expect(outcome.proposal).toBe(true);
		expect(outcome.value).toEqual(proposal('create'));
		expect(applyWriteProposal).not.toHaveBeenCalled();
	});

	it('applies a proposal in autonomous mode and still counts it as a proposal', async () => {
		const outcome = await runner({ success: true, result: proposal('create') }, { autonomous: true }).runner.run(call('write_file'));

		expect(applyWriteProposal).toHaveBeenCalledTimes(1);
		expect(outcome.proposal).toBe(true);
		expect(outcome.value).toEqual({ status: 'applied', operation: 'create', path: 'Notes/a.md', message: 'Vault write applied autonomously to Notes/a.md.' });
	});

	it('applies a batch autonomously unless it contains a delete', async () => {
		const applied = await runner({ success: true, result: batch('create', 'update') }, { autonomous: true }).runner.run(call('write_file'));
		const kept = await runner({ success: true, result: batch('create', 'delete') }, { autonomous: true }).runner.run(call('write_file'));

		expect(applied.value).toEqual({ status: 'applied', message: 'Applied 2 vault change(s) autonomously.' });
		expect(kept.value).toEqual(batch('create', 'delete'));
	});

	it('keeps the proposal for review when applying it fails', async () => {
		(applyWriteProposal as jest.Mock).mockRejectedValueOnce(new Error('locked'));
		jest.spyOn(console, 'error').mockImplementation(() => undefined);

		const outcome = await runner({ success: true, result: proposal('create') }, { autonomous: true }).runner.run(call('write_file'));

		expect(outcome.value).toEqual(proposal('create'));
	});
});
