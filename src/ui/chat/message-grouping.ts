import type { Message } from '@/features/conversations/types/conversation';
import { extractFinalContent, hasAgentToolCall, reconstructAgentSteps } from './handlers/tool-call-handler';

const isToolResult = (message: Message) => message.role === 'system' && message.content.startsWith('Tool ');

export function groupAgentChains(messages: Message[]): Message[] {
	const grouped: Message[] = [];
	let index = 0;
	while (index < messages.length) {
		const message = messages[index];
		if (message.role === 'assistant' && hasAgentToolCall(message.content)) {
			const chain = collectChain(messages, index);
			grouped.push(foldChain(chain));
			index += chain.length;
		} else {
			if (message.role !== 'system') {
				grouped.push(message);
			}
			index++;
		}
	}
	return grouped;
}

function collectChain(messages: Message[], start: number): Message[] {
	const chain = [messages[start]];
	for (const next of messages.slice(start + 1)) {
		if (isToolResult(next)) {
			chain.push(next);
		} else if (next.role === 'assistant') {
			chain.push(next);
			if (!hasAgentToolCall(next.content)) break;
		} else {
			break;
		}
	}
	return chain;
}

function foldChain(chain: Message[]): Message {
	const last = chain[chain.length - 1];
	const answered = !hasAgentToolCall(last.content);
	const saved = chain.find(message => message.agentExecutionSteps?.length)?.agentExecutionSteps;
	return {
		...last,
		content: answered ? last.content : extractFinalContent(last),
		agentExecutionSteps: saved ?? reconstructAgentSteps(answered ? chain.slice(0, -1) : chain),
	};
}
