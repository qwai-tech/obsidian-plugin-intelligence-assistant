import type { AgentWorkingMessage } from './types';
import { boundChatRequest, estimateInputTokens } from '@qwai/obsidian-llm';
import { sanitizeToolCallHistory } from './kernel/agent-message-history';

interface HistoryCompactorOptions { maxEstimatedTokens?: number; keepLastMessages?: number }
interface CompactionResult { messages: AgentWorkingMessage[]; compacted: boolean; summary: string }
export class HistoryCompactor {
	constructor(private readonly options: HistoryCompactorOptions = {}) {}
	compact(messages: AgentWorkingMessage[]): CompactionResult {
		const cleaned = sanitizeToolCallHistory(messages);
		const limit = this.options.maxEstimatedTokens ?? 32_000;
		const result = boundChatRequest({ model: 'history', messages: cleaned, maxTokens: 0, inputTokenBudget: limit });
		return { messages: result.messages as AgentWorkingMessage[], compacted: JSON.stringify(result.messages) !== JSON.stringify(messages), summary: result.messages.filter(message => message.context).map(message => message.content).join('\n') };
	}
	estimateMessages(messages: AgentWorkingMessage[]): number { return estimateInputTokens(messages); }
}
