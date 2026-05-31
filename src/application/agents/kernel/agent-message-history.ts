import type { Message } from '@/types';
import type {
	AgentWorkingMessage,
	AssistantWithCalls,
	ToolResultEntry,
} from '../types';

export function deduplicateWorkingMessages(messages: AgentWorkingMessage[]): AgentWorkingMessage[] {
	if (messages.length <= 1) return messages;
	const result: AgentWorkingMessage[] = [messages[0]];
	for (let i = 1; i < messages.length; i++) {
		const prev = messages[i - 1];
		const cur = messages[i];
		if (cur.role === prev.role && cur.content === prev.content) {
			continue;
		}
		result.push(cur);
	}
	return result;
}

export function sanitizeToolCallHistory(messages: AgentWorkingMessage[]): AgentWorkingMessage[] {
	const sanitized: AgentWorkingMessage[] = [];

	for (let index = 0; index < messages.length; index++) {
		const message = messages[index];
		if (isToolResultEntry(message)) {
			continue;
		}

		const toolCallIds = getToolCallIds(message);
		if (toolCallIds.length === 0) {
			sanitized.push(message);
			continue;
		}

		const toolResults: ToolResultEntry[] = [];
		let cursor = index + 1;
		while (cursor < messages.length && isToolResultEntry(messages[cursor])) {
			toolResults.push(messages[cursor] as ToolResultEntry);
			cursor++;
		}

		if (hasCompleteToolResults(toolCallIds, toolResults)) {
			sanitized.push(message, ...toolResults);
		} else {
			const plainAssistant = stripToolCalls(message);
			if (plainAssistant.content.trim()) {
				sanitized.push(plainAssistant);
			}
		}

		index = cursor - 1;
	}

	return sanitized;
}

function isToolResultEntry(message: AgentWorkingMessage): message is ToolResultEntry {
	return (message as ToolResultEntry).role === 'tool' && typeof (message as ToolResultEntry).tool_call_id === 'string';
}

function getToolCallIds(message: AgentWorkingMessage): string[] {
	if (message.role !== 'assistant') return [];
	const toolCalls = (message as AssistantWithCalls).tool_calls;
	return Array.isArray(toolCalls) ? toolCalls.map(toolCall => toolCall.id).filter(Boolean) : [];
}

function hasCompleteToolResults(toolCallIds: string[], toolResults: ToolResultEntry[]): boolean {
	if (toolResults.length !== toolCallIds.length) return false;
	const expectedIds = new Set(toolCallIds);
	const resultIds = new Set(toolResults.map(result => result.tool_call_id));
	return toolCallIds.every(id => resultIds.has(id)) && toolResults.every(result => expectedIds.has(result.tool_call_id));
}

function stripToolCalls(message: AgentWorkingMessage): Message {
	const { tool_calls: _toolCalls, reasoning_content: _reasoningContent, ...messageWithoutToolCalls } = message as AssistantWithCalls;
	void _toolCalls;
	void _reasoningContent;
	return {
		...messageWithoutToolCalls,
		role: 'assistant',
		content: message.content,
	};
}
