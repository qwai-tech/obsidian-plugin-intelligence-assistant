import type { RegisteredTool } from '@/features/tools/types/tools';

/** Bind the fixture's discovered tools once, like the production registry. */
export function bindAgentRegistry<T extends {
	resolveForAgent: (...args: never[]) => unknown[];
	executeTool: (...args: never[]) => unknown;
}>(registry: T) {
	const tools = new Map((registry.resolveForAgent() as RegisteredTool[]).map(tool => [tool.llmName, tool]));
	return Object.assign(registry, {
		getToolByLlmName: (name: string) => tools.get(name),
		executeBoundTool: async (tool: RegisteredTool, args: Record<string, unknown>, _options?: { signal?: AbortSignal }) => await registry.executeTool(tool.llmName as never, args as never),
	});
}

/** Final response scripts must acknowledge the host's completion review. */
export function finalAgentReply(text: string) {
	return (_request: unknown, onChunk: (chunk: { content: string }) => void): Promise<void> => {
		onChunk({ content: `${text}\n<!-- AGENT_STATUS: complete -->` });
		return Promise.resolve();
	};
}
