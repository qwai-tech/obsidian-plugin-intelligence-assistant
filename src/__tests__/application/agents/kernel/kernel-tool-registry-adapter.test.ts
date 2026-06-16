/**
 * Targeted unit tests for createKernelToolRegistry — the agent orchestration
 * seam that dispatches tool calls, fires the SPAR callbacks with a phase,
 * auto-applies write proposals in autonomous mode, trips the consecutive-failure
 * circuit breaker, registers disabled native tools as deny-stubs, and classifies
 * each tool's side-effect level. These tests pin the exact behaviours that the
 * Stryker mutation gate found unguarded.
 */
import type { App } from 'obsidian';
import type { ToolRegistry as AppToolRegistry } from '@/application/tools/tool-registry';
import type { RegisteredTool, ToolResult } from '@/types/common/tools';
import type { NativeToolDefinition } from '@/types/common/tools';
import type { AgentLoopCallbacks } from '@/application/agents/types';
import type { ToolContext } from '@/application/agents/kernel/agent-engine-core';
import { createKernelToolRegistry } from '@/application/agents/kernel/kernel-tool-registry-adapter';

type ExecResult = ToolResult;

function makeRegisteredTool(over: Partial<RegisteredTool> & { llmName?: string } = {}): RegisteredTool {
	return {
		toolId: over.toolId ?? 'builtin:builtin:write_file',
		llmName: over.llmName ?? 'write_file',
		origin: over.origin ?? ({ kind: 'builtin', sourceId: 'builtin' } as any),
		definition: over.definition ?? { description: 'Write a file', parameters: [] },
		execute: over.execute ?? (async () => ({ success: true, result: null })),
	} as RegisteredTool;
}

function makeNativeTool(name: string, parameters?: unknown): NativeToolDefinition {
	return {
		type: 'function',
		function: {
			name,
			description: `desc for ${name}`,
			parameters: parameters ?? { type: 'object', properties: { foo: { type: 'string' } } },
		},
	} as unknown as NativeToolDefinition;
}

function makeCallbacks(): AgentLoopCallbacks & {
	onToolCall: jest.Mock;
	onToolResult: jest.Mock;
} {
	return {
		onChunk: jest.fn(),
		onToolCall: jest.fn(),
		onToolResult: jest.fn(),
		onThought: jest.fn(),
		onComplete: jest.fn(),
		onError: jest.fn(),
	} as any;
}

function makePlanner(): { fatalStopReason: string | null; currentActionReason: string | undefined } {
	return { fatalStopReason: null, currentActionReason: undefined };
}

function makeAppRegistry(executeTool: (name: string, args: Record<string, unknown>) => Promise<ExecResult>): AppToolRegistry {
	return { executeTool: jest.fn(executeTool) } as unknown as AppToolRegistry;
}

function makeApp(): App & {
	vault: { getAbstractFileByPath: jest.Mock; create: jest.Mock; modify: jest.Mock; createFolder: jest.Mock };
	fileManager: { trashFile: jest.Mock; renameFile: jest.Mock };
} {
	return {
		vault: {
			getAbstractFileByPath: jest.fn(() => null),
			create: jest.fn(async () => undefined),
			modify: jest.fn(async () => undefined),
			createFolder: jest.fn(async () => undefined),
		},
		fileManager: { trashFile: jest.fn(async () => undefined), renameFile: jest.fn(async () => undefined) },
	} as any;
}

const NO_CONTEXT = undefined as unknown as ToolContext;

function build(opts: {
	resolved: RegisteredTool[];
	native?: NativeToolDefinition[];
	knownNative?: NativeToolDefinition[];
	executeTool?: (name: string, args: Record<string, unknown>) => Promise<ExecResult>;
	autoApplyWrites?: boolean;
	app?: App;
}) {
	const callbacks = makeCallbacks();
	const planner = makePlanner();
	const consecutiveFailures = new Map<string, number>();
	const appRegistry = makeAppRegistry(
		opts.executeTool ?? (async () => ({ success: true, result: null })),
	);
	const registry = createKernelToolRegistry(
		appRegistry,
		opts.resolved,
		opts.native ?? [],
		opts.knownNative ?? [],
		consecutiveFailures,
		callbacks,
		planner as any,
		opts.autoApplyWrites ?? false,
		opts.app,
	);
	return { registry, callbacks, planner, consecutiveFailures, appRegistry };
}

describe('createKernelToolRegistry — side-effect classification (toKernelSideEffectLevel)', () => {
	it('classifies a vaultWrite tool as "write"', () => {
		const tool = makeRegisteredTool({
			llmName: 'write_file',
			definition: { description: 'Write', parameters: [], sideEffects: { vaultWrite: true } } as any,
		});
		const { registry } = build({ resolved: [tool] });
		expect(registry.get('write_file')?.sideEffectLevel).toBe('write');
	});

	it('classifies an externalWrite tool as "write"', () => {
		const tool = makeRegisteredTool({
			llmName: 'http_post',
			definition: { description: 'POST', parameters: [], sideEffects: { externalWrite: true } } as any,
		});
		const { registry } = build({ resolved: [tool] });
		expect(registry.get('http_post')?.sideEffectLevel).toBe('write');
	});

	it('classifies a read-only tool (no write side effects) as "read"', () => {
		const tool = makeRegisteredTool({
			llmName: 'read_file',
			definition: { description: 'Read', parameters: [], sideEffects: { vaultWrite: false, externalWrite: false } } as any,
		});
		const { registry } = build({ resolved: [tool] });
		expect(registry.get('read_file')?.sideEffectLevel).toBe('read');
	});

	it('classifies a tool with no sideEffects object as "read"', () => {
		const tool = makeRegisteredTool({
			llmName: 'search',
			definition: { description: 'Search', parameters: [] } as any,
		});
		const { registry } = build({ resolved: [tool] });
		expect(registry.get('search')?.sideEffectLevel).toBe('read');
	});
});

describe('createKernelToolRegistry — registered tool definition fields', () => {
	it('sets requiredScopes to an empty array', () => {
		const { registry } = build({ resolved: [makeRegisteredTool({ llmName: 't1' })] });
		expect(registry.get('t1')?.requiredScopes).toEqual([]);
	});

	it('uses the native tool parameters as the inputSchema when present', () => {
		const params = { type: 'object', properties: { x: { type: 'number' } }, required: ['x'] };
		const native = makeNativeTool('t2', params);
		const { registry } = build({ resolved: [makeRegisteredTool({ llmName: 't2' })], native: [native] });
		expect(registry.get('t2')?.inputSchema).toEqual(params);
	});

	it('falls back to an empty-object schema when no matching native tool exists', () => {
		const { registry } = build({ resolved: [makeRegisteredTool({ llmName: 't3' })], native: [] });
		expect(registry.get('t3')?.inputSchema).toEqual({ type: 'object', properties: {} });
	});

	it('copies the tool description onto the registered definition', () => {
		const tool = makeRegisteredTool({ llmName: 't4', definition: { description: 'My desc', parameters: [] } as any });
		const { registry } = build({ resolved: [tool] });
		expect(registry.get('t4')?.description).toBe('My desc');
	});
});

describe('createKernelToolRegistry — execute success path & phase literals', () => {
	it('fires onToolCall and onToolResult with the exact "act" phase on success', async () => {
		const tool = makeRegisteredTool({ llmName: 'echo' });
		const { registry, callbacks, planner } = build({
			resolved: [tool],
			executeTool: async () => ({ success: true, result: { ok: 1 } }),
		});
		const def = registry.get('echo')!;
		// Reasoning now comes from the planner's current tool-call batch, not the
		// (removed) ToolContext.action — see ProviderKernelPlanner.currentActionReason.
		planner.currentActionReason = 'because';
		const out = await def.execute({ a: 1 } as any, NO_CONTEXT);

		expect(callbacks.onToolCall).toHaveBeenCalledTimes(1);
		expect(callbacks.onToolCall).toHaveBeenCalledWith('echo', { a: 1 }, 'because', 'act');
		expect(callbacks.onToolResult).toHaveBeenCalledTimes(1);
		expect(callbacks.onToolResult).toHaveBeenCalledWith('echo', true, JSON.stringify({ ok: 1 }), 'act');
		expect(out).toEqual({ ok: 1 });
	});

	it('passes reasoning=undefined when the planner has no current reason', async () => {
		const tool = makeRegisteredTool({ llmName: 'echo' });
		const { registry, callbacks } = build({
			resolved: [tool],
			executeTool: async () => ({ success: true, result: 'r' }),
		});
		// planner.currentActionReason defaults to undefined.
		await registry.get('echo')!.execute({} as any, NO_CONTEXT);
		expect(callbacks.onToolCall).toHaveBeenCalledWith('echo', {}, undefined, 'act');
	});

	it('reads the planner reason at call time, reflecting the current batch', async () => {
		const tool = makeRegisteredTool({ llmName: 'echo' });
		const { registry, callbacks, planner } = build({
			resolved: [tool],
			executeTool: async () => ({ success: true, result: 'r' }),
		});
		const def = registry.get('echo')!;
		planner.currentActionReason = 'first';
		await def.execute({} as any, NO_CONTEXT);
		planner.currentActionReason = 'second';
		await def.execute({} as any, NO_CONTEXT);
		expect(callbacks.onToolCall).toHaveBeenNthCalledWith(1, 'echo', {}, 'first', 'act');
		expect(callbacks.onToolCall).toHaveBeenNthCalledWith(2, 'echo', {}, 'second', 'act');
	});

	it('clears the consecutive-failure counter on success', async () => {
		const tool = makeRegisteredTool({ llmName: 'echo' });
		const { registry, consecutiveFailures } = build({
			resolved: [tool],
			executeTool: async () => ({ success: true, result: 'r' }),
		});
		consecutiveFailures.set('echo', 2);
		await registry.get('echo')!.execute({} as any, NO_CONTEXT);
		expect(consecutiveFailures.has('echo')).toBe(false);
	});
});

describe('createKernelToolRegistry — failure path, message & circuit breaker', () => {
	const failResult: ExecResult = { success: false, error: 'boom' };

	it('emits the exact failure output string and throws it', async () => {
		const tool = makeRegisteredTool({ llmName: 'flaky' });
		const { registry, callbacks } = build({ resolved: [tool], executeTool: async () => failResult });
		const def = registry.get('flaky')!;
		await expect(def.execute({} as any, NO_CONTEXT)).rejects.toThrow('Tool "flaky" failed: boom');
		expect(callbacks.onToolResult).toHaveBeenCalledWith('flaky', false, 'Tool "flaky" failed: boom', 'act');
	});

	it('uses "Unknown error" when the result carries no error message', async () => {
		const tool = makeRegisteredTool({ llmName: 'flaky' });
		const { registry, callbacks } = build({ resolved: [tool], executeTool: async () => ({ success: false }) });
		await expect(registry.get('flaky')!.execute({} as any, NO_CONTEXT)).rejects.toThrow(
			'Tool "flaky" failed: Unknown error',
		);
		expect(callbacks.onToolResult).toHaveBeenCalledWith('flaky', false, 'Tool "flaky" failed: Unknown error', 'act');
	});

	it('increments the counter by exactly 1 per failure', async () => {
		const tool = makeRegisteredTool({ llmName: 'flaky' });
		const { registry, consecutiveFailures } = build({ resolved: [tool], executeTool: async () => failResult });
		const def = registry.get('flaky')!;
		await expect(def.execute({} as any, NO_CONTEXT)).rejects.toThrow();
		expect(consecutiveFailures.get('flaky')).toBe(1);
		await expect(def.execute({} as any, NO_CONTEXT)).rejects.toThrow();
		expect(consecutiveFailures.get('flaky')).toBe(2);
	});

	it('does NOT set fatalStopReason below MAX_CONSECUTIVE_FAILURES (2 failures)', async () => {
		const tool = makeRegisteredTool({ llmName: 'flaky' });
		const { registry, planner } = build({ resolved: [tool], executeTool: async () => failResult });
		const def = registry.get('flaky')!;
		await expect(def.execute({} as any, NO_CONTEXT)).rejects.toThrow();
		await expect(def.execute({} as any, NO_CONTEXT)).rejects.toThrow();
		expect(planner.fatalStopReason).toBeNull();
	});

	it('sets fatalStopReason exactly at MAX_CONSECUTIVE_FAILURES (3rd failure, boundary)', async () => {
		const tool = makeRegisteredTool({ llmName: 'flaky' });
		const { registry, planner, consecutiveFailures } = build({ resolved: [tool], executeTool: async () => failResult });
		const def = registry.get('flaky')!;
		await expect(def.execute({} as any, NO_CONTEXT)).rejects.toThrow();
		await expect(def.execute({} as any, NO_CONTEXT)).rejects.toThrow();
		expect(planner.fatalStopReason).toBeNull();
		await expect(def.execute({} as any, NO_CONTEXT)).rejects.toThrow();
		expect(consecutiveFailures.get('flaky')).toBe(3);
		expect(planner.fatalStopReason).toBe('Tool "flaky" failed 3 consecutive times.');
	});
});

describe('createKernelToolRegistry — disabled native tool deny-stub', () => {
	it('throws the exact "not enabled" message and reports failure on the act phase', async () => {
		const known = makeNativeTool('forbidden');
		const { registry, callbacks, planner } = build({ resolved: [], knownNative: [known] });
		const def = registry.get('forbidden')!;
		expect(def.sideEffectLevel).toBe('none');
		planner.currentActionReason = 'why';
		expect(() => def.execute({ q: 1 } as any, NO_CONTEXT)).toThrow(
			'Tool "forbidden" is not enabled for this agent',
		);
		expect(callbacks.onToolCall).toHaveBeenCalledWith('forbidden', { q: 1 }, 'why', 'act');
		expect(callbacks.onToolResult).toHaveBeenCalledWith(
			'forbidden',
			false,
			'Tool "forbidden" is not enabled for this agent',
			'act',
		);
	});

	it('deny-stub passes reasoning=undefined when the planner has no current reason', () => {
		const known = makeNativeTool('forbidden');
		const { registry, callbacks } = build({ resolved: [], knownNative: [known] });
		// planner.currentActionReason defaults to undefined.
		expect(() => registry.get('forbidden')!.execute({ q: 1 } as any, NO_CONTEXT)).toThrow(
			'Tool "forbidden" is not enabled for this agent',
		);
		expect(callbacks.onToolCall).toHaveBeenCalledWith('forbidden', { q: 1 }, undefined, 'act');
	});

	it('does not register a deny-stub for a native tool already resolved (enabled)', () => {
		const resolved = makeRegisteredTool({ llmName: 'shared' });
		const known = makeNativeTool('shared');
		const { registry, callbacks } = build({ resolved: [resolved], knownNative: [known] });
		// The enabled tool wins: executing it dispatches, not the deny path.
		expect(registry.get('shared')?.sideEffectLevel).not.toBe('none');
		expect(callbacks.onToolResult).not.toHaveBeenCalled();
	});

	it('falls back to an empty-object inputSchema for a deny-stub with no parameters', () => {
		const known = makeNativeTool('noparams', undefined);
		// override parameters to undefined explicitly
		(known as any).function.parameters = undefined;
		const { registry } = build({ resolved: [], knownNative: [known] });
		expect(registry.get('noparams')?.inputSchema).toEqual({ type: 'object', properties: {} });
	});
});

describe('createKernelToolRegistry — autonomous write auto-apply', () => {
	const SINGLE_CREATE = {
		type: 'write_proposal',
		operation: 'create',
		path: 'Notes/Plan.md',
		reason: 'r',
		proposedContent: '# Plan',
		applied: false,
	};

	it('auto-applies a single create proposal and returns the exact applied record', async () => {
		const app = makeApp();
		const tool = makeRegisteredTool({ llmName: 'write_file' });
		const { registry, callbacks } = build({
			resolved: [tool],
			executeTool: async () => ({ success: true, result: SINGLE_CREATE }),
			autoApplyWrites: true,
			app,
		});
		const out = await registry.get('write_file')!.execute({} as any, NO_CONTEXT);

		expect(app.vault.create).toHaveBeenCalledWith('Notes/Plan.md', '# Plan');
		expect(out).toEqual({
			status: 'applied',
			operation: 'create',
			path: 'Notes/Plan.md',
			message: 'Vault write applied autonomously to Notes/Plan.md.',
		});
		// onToolResult receives the serialized applied record (substitution branch).
		expect(callbacks.onToolResult).toHaveBeenCalledWith('write_file', true, JSON.stringify(out), 'act');
	});

	it('auto-applies a batch proposal and returns the exact batch applied record', async () => {
		const app = makeApp();
		// Two create proposals to absent paths so applyWriteProposal runs cleanly
		// through vault.create twice (no TFile instanceof needed).
		const batch = {
			type: 'batch_proposal',
			applied: false,
			proposals: [
				{ type: 'write_proposal', operation: 'create', path: 'a.md', proposedContent: 'A', applied: false },
				{ type: 'write_proposal', operation: 'create', path: 'b.md', proposedContent: 'B', applied: false },
			],
		};
		const tool = makeRegisteredTool({ llmName: 'write_batch' });
		const { registry } = build({
			resolved: [tool],
			executeTool: async () => ({ success: true, result: batch }),
			autoApplyWrites: true,
			app,
		});
		const out = await registry.get('write_batch')!.execute({} as any, NO_CONTEXT);
		expect(app.vault.create).toHaveBeenCalledWith('a.md', 'A');
		expect(app.vault.create).toHaveBeenCalledWith('b.md', 'B');
		expect(out).toEqual({ status: 'applied', message: 'Applied 2 vault change(s) autonomously.' });
	});

	it('does NOT auto-apply a batch that contains a delete (delete-skip guard); keeps original proposal', async () => {
		const app = makeApp();
		const batch = {
			type: 'batch_proposal',
			applied: false,
			proposals: [
				{ type: 'write_proposal', operation: 'create', path: 'a.md', proposedContent: 'A', applied: false },
				{ type: 'write_proposal', operation: 'delete', path: 'gone.md', applied: false },
			],
		};
		const tool = makeRegisteredTool({ llmName: 'write_batch' });
		const { registry } = build({
			resolved: [tool],
			executeTool: async () => ({ success: true, result: batch }),
			autoApplyWrites: true,
			app,
		});
		const out = await registry.get('write_batch')!.execute({} as any, NO_CONTEXT);
		// autoApplyProposal returns null → original batch proposal flows through unchanged.
		expect(out).toEqual(batch);
		expect(app.vault.create).not.toHaveBeenCalled();
	});

	it('leaves the proposal as a manual proposal when apply throws (catch fallback)', async () => {
		const app = makeApp();
		// create() throws → autoApplyProposal catches and returns null.
		app.vault.create = jest.fn(async () => {
			throw new Error('disk full');
		});
		const tool = makeRegisteredTool({ llmName: 'write_file' });
		const { registry } = build({
			resolved: [tool],
			executeTool: async () => ({ success: true, result: SINGLE_CREATE }),
			autoApplyWrites: true,
			app,
		});
		const out = await registry.get('write_file')!.execute({} as any, NO_CONTEXT);
		expect(out).toEqual(SINGLE_CREATE);
	});

	it('does NOT auto-apply when autoApplyWrites is false (proposal passes through)', async () => {
		const app = makeApp();
		const tool = makeRegisteredTool({ llmName: 'write_file' });
		const { registry } = build({
			resolved: [tool],
			executeTool: async () => ({ success: true, result: SINGLE_CREATE }),
			autoApplyWrites: false,
			app,
		});
		const out = await registry.get('write_file')!.execute({} as any, NO_CONTEXT);
		expect(app.vault.create).not.toHaveBeenCalled();
		expect(out).toEqual(SINGLE_CREATE);
	});

	it('does NOT auto-apply for a non-proposal result even when autonomous', async () => {
		const app = makeApp();
		const tool = makeRegisteredTool({ llmName: 'read_file' });
		const { registry } = build({
			resolved: [tool],
			executeTool: async () => ({ success: true, result: { content: 'hello' } }),
			autoApplyWrites: true,
			app,
		});
		const out = await registry.get('read_file')!.execute({} as any, NO_CONTEXT);
		expect(app.vault.create).not.toHaveBeenCalled();
		expect(out).toEqual({ content: 'hello' });
	});
});
