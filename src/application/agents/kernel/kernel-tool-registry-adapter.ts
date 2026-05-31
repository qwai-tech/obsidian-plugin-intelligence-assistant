import type { ToolRegistry as AppToolRegistry } from '@/application/tools/tool-registry';
import type { RegisteredTool } from '@/types/common/tools';
import type { AgentLoopCallbacks } from '../types';
import {
	ToolRegistry as KernelToolRegistry,
} from './agent-engine-core';
import type { ToolSideEffectLevel } from './agent-engine-core';
import type { NativeToolDefinition, ProviderKernelPlanner } from './provider-kernel-planner';
import { serializeToolResult, toJsonObject, toJsonValue } from './json-utils';

const MAX_CONSECUTIVE_FAILURES = 3;

export function createKernelToolRegistry(
	appToolRegistry: AppToolRegistry,
	resolvedTools: RegisteredTool[],
	nativeTools: NativeToolDefinition[],
	knownNativeTools: NativeToolDefinition[],
	consecutiveFailures: Map<string, number>,
	callbacks: AgentLoopCallbacks,
	planner: ProviderKernelPlanner,
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
			execute: async (args, context) => {
				const reasoning = context?.action?.reasoning;
				callbacks.onToolCall(tool.llmName, args, reasoning, 'act');
				const result = await appToolRegistry.executeTool(tool.llmName, args);
				const output = result.success
					? serializeToolResult(result.result)
					: `Tool "${tool.llmName}" failed: ${result.error ?? 'Unknown error'}`;
				callbacks.onToolResult(tool.llmName, result.success, output, 'act');

				if (result.success) {
					consecutiveFailures.delete(tool.llmName);
					return toJsonValue(result.result);
				}

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
			execute: (args, context) => {
				const reasoning = context?.action?.reasoning;
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
