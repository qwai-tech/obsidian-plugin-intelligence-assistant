import type { Message } from '@/types';
import type { ChatRequest } from '@/types/common/llm';
import type { ToolRegistry } from '@/application/tools/tool-registry';
import type { AgentLoopOptions, AgentWorkingMessage } from '../types';
import type { HistoryCompactor } from '../history-compactor';
import type { ContextAssembler } from './turn-kernel';
import { deduplicateWorkingMessages, sanitizeToolCallHistory } from './agent-message-history';

export type NativeToolDefinition = ReturnType<ToolRegistry['toOpenAIFunctions']>[number];

export interface AgentContextOptions {
	options: AgentLoopOptions;
	historyCompactor: HistoryCompactor;
	systemMessages: Message[];
	tools: NativeToolDefinition[];
	contextWindow: number;
}

export class AgentContextAssembler implements ContextAssembler {
	constructor(private readonly context: AgentContextOptions) {}

	request(history: AgentWorkingMessage[], forceTool: string | undefined, signal: AbortSignal): ChatRequest {
		const { options, historyCompactor, systemMessages, tools, contextWindow } = this.context;
		const recent = deduplicateWorkingMessages(historyCompactor.compact(history).messages);
		const window = recent.length > contextWindow ? recent.slice(-contextWindow) : recent;
		const hasTools = tools.length > 0;
		return {
			messages: sanitizeToolCallHistory([...systemMessages, ...window]) as Message[],
			model: options.model,
			signal,
			temperature: options.temperature,
			maxTokens: options.maxTokens,
			topP: options.topP,
			frequencyPenalty: options.frequencyPenalty,
			presencePenalty: options.presencePenalty,
			tools: hasTools ? tools : undefined,
			toolChoice: forceTool ? { type: 'function', function: { name: forceTool } } : hasTools ? 'auto' : undefined,
		};
	}
}
