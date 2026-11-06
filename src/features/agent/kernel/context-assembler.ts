import { boundChatRequest } from '@qwai/obsidian-llm';
import type { Message } from '@/features/conversations';
import type { ChatRequest } from '@/features/llm';
import type { ToolRegistry } from '@/features/tools';
import type { AgentLoopOptions, AgentWorkingMessage } from '../types';
import type { HistoryCompactor } from '../history-compactor';
import type { ContextAssembler } from './turn-kernel';
import { deduplicateWorkingMessages, sanitizeToolCallHistory } from './agent-message-history';
import { omittedToolRecords } from './execution-ledger';
import { runStartContext, type RunStart } from './run-start-context';

export type NativeToolDefinition = ReturnType<ToolRegistry['toOpenAIFunctions']>[number];

export interface AgentContextOptions {
	options: AgentLoopOptions;
	historyCompactor: HistoryCompactor;
	systemMessages: Message[];
	tools: NativeToolDefinition[];
	contextWindow: number;
	executionContext?: () => Message[];
}

export class AgentContextAssembler implements ContextAssembler {
	private run?: RunStart;
	constructor(private readonly context: AgentContextOptions) {}
	beginRun(run: RunStart): void { this.run = { ...run }; }

	request(history: AgentWorkingMessage[], forceTool: string | undefined, signal: AbortSignal): ChatRequest {
		const { options, historyCompactor, systemMessages, tools, contextWindow } = this.context;
		const recent = deduplicateWorkingMessages(historyCompactor.compact(history).messages);
		let start = Math.max(0, recent.length - contextWindow);
		// Move back to the assistant that owns a cut tool-result group.
		while (start > 0 && recent[start]?.role === 'tool') start--;
		const window = recent.slice(start);
		const retained = recent.slice(0, start).filter(message => message.role === 'system' && !message.context);
		const goal = [...history].reverse().find(message => message.role === 'user');
		// Compaction clones messages. Object identity would duplicate the current
		// request on every turn, wasting the budget reserved for execution history.
		if (goal && !window.some(message => message.role === 'user' && message.content === goal.content)) window.unshift(goal);
		const hasTools = tools.length > 0;
		return boundChatRequest({
			// These facts are recomputed AFTER the tool history below. Placing a
			// live counter before recent results makes it look like a stale boundary
			// to which those results should be added a second time.
			messages: sanitizeToolCallHistory([...systemMessages, ...retained, ...(this.run ? [runStartContext(this.run, history)] : []), ...omittedToolRecords(history, window, this.run?.historyLength), ...window, ...(this.context.executionContext?.() ?? [])]),
			model: options.model,
			inputTokenBudget: options.inputTokenBudget,
			conversationId: options.conversationId,
			purpose: 'agent',
			signal,
			temperature: options.temperature,
			maxTokens: options.maxTokens,
			topP: options.topP,
			frequencyPenalty: options.frequencyPenalty,
			presencePenalty: options.presencePenalty,
			tools: hasTools ? tools : undefined,
			toolChoice: forceTool ? { type: 'function', function: { name: forceTool } } : hasTools ? 'auto' : undefined,
		});
	}
}
