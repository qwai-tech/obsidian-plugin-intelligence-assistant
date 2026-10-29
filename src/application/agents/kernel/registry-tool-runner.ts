import type { App } from 'obsidian';
import type { ToolRegistry } from '@/application/tools/tool-registry';
import { applyWriteProposal, isBatchWriteProposal, isWriteProposal } from '@/application/services/write-proposal-service';
import type { ToolCallRequest } from '@/types/features/agent-run';
import type { ToolOutcome, ToolRunner } from './turn-kernel';
import { serializeToolResult, toJsonValue } from './json-utils';

export interface RegistryToolRunnerOptions {
	registry: ToolRegistry;
	enabled: ReadonlySet<string>;
	known: ReadonlySet<string>;
	autonomous: boolean;
	app: App;
}

export class RegistryToolRunner implements ToolRunner {
	constructor(private readonly options: RegistryToolRunnerOptions) {}

	async run(call: ToolCallRequest): Promise<ToolOutcome> {
		if (!this.options.enabled.has(call.name)) {
			const reason = this.options.known.has(call.name) ? 'is not enabled for this agent' : 'does not exist';
			return failure(`Tool "${call.name}" ${reason}`);
		}
		const result = await this.options.registry.executeTool(call.name, call.arguments);
		if (!result.success) {
			return failure(`Tool "${call.name}" failed: ${result.error ?? 'Unknown error'}`);
		}
		const proposal = isProposal(result.result);
		const value = proposal && this.options.autonomous ? await this.autoApply(result.result) : result.result;
		return { ok: true, value: toJsonValue(value), output: serializeToolResult(value), proposal };
	}

	private async autoApply(value: unknown): Promise<unknown> {
		try {
			if (isBatchWriteProposal(value) && !value.proposals.some((p) => p.operation === 'delete')) {
				await applyWriteProposal(this.options.app, value);
				return { status: 'applied', message: `Applied ${value.proposals.length} vault change(s) autonomously.` };
			}
			if (isWriteProposal(value)) {
				await applyWriteProposal(this.options.app, value);
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
