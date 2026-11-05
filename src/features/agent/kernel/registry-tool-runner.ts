import type { App } from 'obsidian';
import type { ToolRegistry, RegisteredTool } from '@/features/tools';
import { isBatchWriteProposal, isWriteProposal } from '@/features/agent/write-proposal';
import type { ToolCallRequest } from '@/features/agent/types/agent-run';
import type { ToolOutcome, ToolRunner } from './turn-kernel';
import { serializeToolResult, toJsonValue } from './json-utils';
import { ArgumentEvidence } from './argument-evidence';

export interface RegistryToolRunnerOptions {
	registry: ToolRegistry;
	enabled: ReadonlySet<string>;
	known: ReadonlySet<string>;
	autonomous: boolean;
	app: App;
	bindings?: ReadonlyMap<string, RegisteredTool>;
	taskAllowed?: ReadonlySet<string>;
}

export class RegistryToolRunner implements ToolRunner {
	private readonly bindings: ReadonlyMap<string, RegisteredTool>;
	private readonly evidence: ArgumentEvidence;
	constructor(private readonly options: RegistryToolRunnerOptions) {
		this.bindings = options.bindings ?? new Map([...options.enabled].flatMap(name => {
			const tool = options.registry.getToolByLlmName(name);
			return tool ? [[name, tool] as const] : [];
		}));
		this.evidence = new ArgumentEvidence(this.bindings);
	}

	evidenceContext() { return this.evidence.context(); }

	async run(call: ToolCallRequest, signal?: AbortSignal): Promise<ToolOutcome> {
		if (this.options.taskAllowed && !this.options.taskAllowed.has(call.name)) {
			return { ...failure(`Tool "${call.name}" is forbidden by the current task's explicit tool allowlist. This call was NOT executed. Use only permitted tools or report a blocker; permissions are unchanged.`), preflightRejected: true };
		}
		if (!this.options.enabled.has(call.name)) {
			const reason = this.options.known.has(call.name) ? 'is not enabled for this agent' : 'does not exist';
			return failure(`Tool "${call.name}" ${reason}`);
		}
		signal?.throwIfAborted();
		const binding = this.bindings.get(call.name);
		if (!binding) return failure(`Tool ${call.name} is not bound to this task`);
		const evidenceError = this.evidence.check(call, binding);
		if (evidenceError) return { ...failure(evidenceError), preflightRejected: true };
		this.evidence.consume(call, binding);
		const result = await this.options.registry.executeBoundTool(binding, call.arguments, { signal });
		signal?.throwIfAborted();
		if (!result.success) {
			this.evidence.failed(call);
			return failure(`Tool "${call.name}" failed: ${result.error ?? 'Unknown error'}`);
		}
		const proposal = isProposal(result.result);
		const value = proposal && this.options.autonomous ? await this.autoApply(result.result, signal) : result.result;
		signal?.throwIfAborted();
		this.evidence.record(call, binding, value);
		return { ok: true, value: toJsonValue(value), output: serializeToolResult(value), proposal };
	}

	private async autoApply(value: unknown, signal?: AbortSignal): Promise<unknown> {
		try {
			const { applyWriteProposal } = await import('@/features/agent/write-proposal-service');
			signal?.throwIfAborted();
			if (isBatchWriteProposal(value) && value.proposals.every(isWriteProposal)) {
				await applyWriteProposal(this.options.app, value, signal);
				return { status: 'applied', message: `Applied ${value.proposals.length} vault change(s) autonomously.` };
			}
			if (isWriteProposal(value)) {
				await applyWriteProposal(this.options.app, value, signal);
				return { status: 'applied', operation: value.operation, path: value.path, message: `Vault write applied autonomously to ${value.path}.` };
			}
		} catch (error) {
			console.error('[AutoApply] apply failed; leaving as a manual proposal:', error);
		}
		return value;
	}
}

function failure(output: string): ToolOutcome {
	return { ok: false, value: null, output, proposal: false };
}

function isProposal(value: unknown): boolean {
	return isBatchWriteProposal(value) || (typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'write_proposal');
}
