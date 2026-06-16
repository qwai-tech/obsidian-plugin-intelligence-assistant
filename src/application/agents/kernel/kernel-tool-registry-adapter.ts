import { App } from 'obsidian';
import type { ToolRegistry as AppToolRegistry } from '@/application/tools/tool-registry';
import type { RegisteredTool } from '@/types/common/tools';
import type { AgentLoopCallbacks } from '../types';
import {
	applyWriteProposal,
	isBatchWriteProposal,
	isWriteProposal,
} from '@/application/services/write-proposal-service';
import {
	ToolRegistry as KernelToolRegistry,
} from './agent-engine-core';
import type { ToolSideEffectLevel } from './agent-engine-core';
import type { NativeToolDefinition, ProviderKernelPlanner } from './provider-kernel-planner';
import { serializeToolResult, toJsonObject, toJsonValue } from './json-utils';

const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * In autonomous mode, write proposals are applied to the vault immediately
 * instead of waiting for an Apply click. Destructive ops (delete) are never
 * auto-applied; on any apply failure we fall back to the normal proposal so the
 * user can still review it. Returns the applied-confirmation record, or null to
 * keep the original proposal result.
 */
async function autoApplyProposal(app: App, value: unknown): Promise<Record<string, unknown> | null> {
	try {
		if (isBatchWriteProposal(value)) {
			if (value.proposals.some(p => p.operation === 'delete')) return null;
			await applyWriteProposal(app, value);
			return { status: 'applied', message: `Applied ${value.proposals.length} vault change(s) autonomously.` };
		}
		if (isWriteProposal(value)) {
			if (value.operation === 'delete') return null;
			await applyWriteProposal(app, value);
			return { status: 'applied', operation: value.operation, path: value.path, message: `Vault write applied autonomously to ${value.path}.` };
		}
	} catch (err) {
		console.error('[AutoApply] apply failed; leaving as a manual proposal:', err);
	}
	return null;
}

export function createKernelToolRegistry(
	appToolRegistry: AppToolRegistry,
	resolvedTools: RegisteredTool[],
	nativeTools: NativeToolDefinition[],
	knownNativeTools: NativeToolDefinition[],
	consecutiveFailures: Map<string, number>,
	callbacks: AgentLoopCallbacks,
	planner: ProviderKernelPlanner,
	autoApplyWrites: boolean,
	app?: App,
): KernelToolRegistry {
	const registry = new KernelToolRegistry();
	const nativeToolByName = new Map(nativeTools.map(tool => [tool.function.name, tool]));
	const registeredNames = new Set<string>();
	for (const tool of resolvedTools) {
		const nativeTool = nativeToolByName.get(tool.llmName);
		registeredNames.add(tool.llmName);
		registry.register({
			name: tool.llmName,
			description: tool.definition.description,
			inputSchema: toJsonObject(nativeTool?.function.parameters ?? { type: 'object', properties: {} }),
			sideEffectLevel: toKernelSideEffectLevel(tool),
			requiredScopes: [],
			execute: async (args) => {
				const reasoning = planner.currentActionReason;
				callbacks.onToolCall(tool.llmName, args, reasoning, 'act');
				const result = await appToolRegistry.executeTool(tool.llmName, args);

				if (result.success) {
					consecutiveFailures.delete(tool.llmName);
					let finalResult: unknown = result.result;
					if (autoApplyWrites && app) {
						const applied = await autoApplyProposal(app, result.result);
						if (applied !== null) finalResult = applied;
					}
					const output = serializeToolResult(finalResult);
					callbacks.onToolResult(tool.llmName, true, output, 'act');
					return toJsonValue(finalResult);
				}

				const output = `Tool "${tool.llmName}" failed: ${result.error ?? 'Unknown error'}`;
				callbacks.onToolResult(tool.llmName, false, output, 'act');
				const failures = (consecutiveFailures.get(tool.llmName) ?? 0) + 1;
				consecutiveFailures.set(tool.llmName, failures);
				if (failures >= MAX_CONSECUTIVE_FAILURES) {
					planner.fatalStopReason = `Tool "${tool.llmName}" failed ${failures} consecutive times.`;
				}
				throw new Error(output);
			},
		});
	}
	for (const nativeTool of knownNativeTools) {
		const name = nativeTool.function.name;
		if (registeredNames.has(name)) continue;
		registeredNames.add(name);
		registry.register({
			name,
			description: nativeTool.function.description,
			inputSchema: toJsonObject(nativeTool.function.parameters ?? { type: 'object', properties: {} }),
			sideEffectLevel: 'none',
			requiredScopes: [],
			execute: (args) => {
				const reasoning = planner.currentActionReason;
				const message = `Tool "${name}" is not enabled for this agent`;
				callbacks.onToolCall(name, args, reasoning, 'act');
				callbacks.onToolResult(name, false, message, 'act');
				throw new Error(message);
			},
		});
	}
	return registry;
}

function toKernelSideEffectLevel(tool: RegisteredTool): ToolSideEffectLevel {
	if (tool.definition.sideEffects?.vaultWrite || tool.definition.sideEffects?.externalWrite) {
		return 'write';
	}
	return 'read';
}
