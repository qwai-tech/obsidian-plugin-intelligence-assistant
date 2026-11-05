import type { Message } from '@/features/conversations';
import type {
	AgentWorkingMessage,
	AssistantWithCalls,
	ToolResultEntry,
} from '../types';

export function deduplicateWorkingMessages(messages: AgentWorkingMessage[]): AgentWorkingMessage[] {
	// Repeated content is a legitimate distinct turn/result; call IDs carry identity.
	return [...messages];
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
			const evidence = toolResults.map(result => `Tool result ${result.tool_call_id}: ${result.content}`).join('\n');
			plainAssistant.content = [plainAssistant.content, 'Incomplete historical tool batch; available execution records follow. Do not assume missing calls succeeded.', evidence].filter(Boolean).join('\n');
			sanitized.push(plainAssistant);
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
