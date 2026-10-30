import type { Message } from '@/features/conversations';
import type { AgentExecutionStep } from '@/features/llm';

const JSON_BLOCK = /```json\s*\n([\s\S]*?)\n```/g;

interface LegacyCall {
	name: string;
	args: Record<string, unknown>;
}

export function groupAgentChains(messages: Message[]): Message[] {
	const grouped: Message[] = [];
	let index = 0;
	while (index < messages.length) {
		const message = messages[index];
		if (startsLegacyChain(messages, index)) {
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

function startsLegacyChain(messages: Message[], index: number): boolean {
	const next = messages[index + 1];
	return messages[index].role === 'assistant' && legacyCalls(messages[index].content).length > 0 && next !== undefined && isToolResult(next);
}

function collectChain(messages: Message[], start: number): Message[] {
	const chain = [messages[start]];
	for (const next of messages.slice(start + 1)) {
		if (isToolResult(next)) {
			chain.push(next);
		} else if (next.role === 'assistant') {
			chain.push(next);
			if (legacyCalls(next.content).length === 0) break;
		} else {
			break;
		}
	}
	return chain;
}

function foldChain(chain: Message[]): Message {
	const last = chain[chain.length - 1];
	const answer = last.role === 'assistant' && legacyCalls(last.content).length === 0 ? last : null;
	const lastCall = [...chain].reverse().find(message => message.role === 'assistant') ?? last;
	const saved = chain.find(message => message.agentExecutionSteps?.length)?.agentExecutionSteps;
	return {
		...(answer ?? lastCall),
		content: answer ? answer.content : withoutJsonBlocks(lastCall.content),
		agentExecutionSteps: saved ?? reconstructSteps(answer ? chain.slice(0, -1) : chain),
	};
}

function isToolResult(message: Message): boolean {
	return message.role === 'system' && message.content.startsWith('Tool ');
}

function legacyCalls(content: string): LegacyCall[] {
	const calls: LegacyCall[] = [];
	for (const [, body] of content.matchAll(JSON_BLOCK)) {
		try {
			const json = JSON.parse(body) as Record<string, unknown>;
			const name = json.name ?? json.tool;
			if (typeof name === 'string' && name) {
				const args = typeof json.arguments === 'object' && json.arguments !== null ? json.arguments as Record<string, unknown> : {};
				calls.push({ name, args });
			}
		} catch {
			// Not a tool call.
		}
	}
	return calls;
}

function withoutJsonBlocks(content: string): string {
	return content.replace(JSON_BLOCK, '').trim();
}

function reconstructSteps(messages: Message[]): AgentExecutionStep[] {
	return messages.flatMap((message): AgentExecutionStep[] => {
		if (isToolResult(message)) {
			const content = message.content.match(/^Tool\s+\S+\s+result:\s*([\s\S]*)$/)?.[1] ?? message.content;
			const failed = content.startsWith('Error:') || content.startsWith('Unknown error');
			return [{ type: 'observation', content, timestamp: Date.now(), status: failed ? 'error' : 'success' }];
		}
		return legacyCalls(message.content).map(({ name, args }) => ({
			type: 'action',
			content: `${name}(${JSON.stringify(args)})`,
			timestamp: Date.now(),
			status: 'success',
		}));
	});
}
