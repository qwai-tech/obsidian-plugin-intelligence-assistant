/**
 * Serialize internal chat messages to OpenAI-compatible wire messages.
 *
 * The agent planner tracks bookkeeping fields on its working messages (`model`,
 * `reasoning_content`, `attachments`, …). Those are NOT valid OpenAI chat-message
 * keys: lenient servers ignore them, but strict gateways (e.g. Manifold) reject
 * the request with `Unrecognized key: "model"`. Echoing `reasoning_content` back
 * is also incorrect per DeepSeek's own guidance. This keeps only the spec fields
 * (role, content, name, tool_calls, tool_call_id) and expands image attachments
 * into the multimodal `content` array.
 */
import type { Message } from '@/types';

export interface OpenAiWireMessage {
	role: string;
	content: unknown;
	name?: string;
	tool_calls?: unknown;
	tool_call_id?: string;
}

export function toOpenAiWireMessage(msg: Message): OpenAiWireMessage {
	const raw = msg as unknown as Record<string, unknown>;
	const wire: OpenAiWireMessage = { role: msg.role, content: msg.content };

	if (raw.tool_calls !== undefined) wire.tool_calls = raw.tool_calls;
	if (typeof raw.tool_call_id === 'string') wire.tool_call_id = raw.tool_call_id;
	if (typeof raw.name === 'string') wire.name = raw.name;

	// Multimodal: a user message with image attachments becomes a content array.
	if (msg.role === 'user' && msg.attachments?.some(att => att.type === 'image')) {
		const content: Record<string, unknown>[] = [{ type: 'text', text: msg.content }];
		for (const att of msg.attachments) {
			if (att.type === 'image' && att.content) {
				content.push({ type: 'image_url', image_url: { url: att.content } });
			}
		}
		wire.content = content;
	}

	return wire;
}

export function toOpenAiWireMessages(messages: Message[]): OpenAiWireMessage[] {
	return messages.map(toOpenAiWireMessage);
}
