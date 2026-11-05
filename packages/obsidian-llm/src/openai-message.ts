/**
 * Serialize internal chat messages to OpenAI-compatible wire messages.
 *
 * The agent planner tracks bookkeeping fields on its working messages (`model`,
 * `attachments`, …). Those are NOT valid OpenAI chat-message
 * keys: lenient servers ignore them, but strict gateways (e.g. Manifold) reject
 * the request with `Unrecognized key: "model"`. DeepSeek tool-enabled requests
 * additionally require reasoning_content; callers must explicitly opt in.
 * This keeps only the spec fields
 * (role, content, name, tool_calls, tool_call_id) and expands image attachments
 * into the multimodal `content` array.
 */
import type { LLMMessage } from './types';

export interface OpenAiWireMessage {
	role: string;
	content: unknown;
	name?: string;
	tool_calls?: unknown;
	tool_call_id?: string;
	reasoning_content?: string;
}

export function toOpenAiWireMessage(msg: LLMMessage, includeReasoning = false): OpenAiWireMessage {
	const raw = msg as unknown as Record<string, unknown>;
	const wire: OpenAiWireMessage = { role: msg.role, content: msg.content };

	if (raw.tool_calls !== undefined) wire.tool_calls = raw.tool_calls;
	if (typeof raw.tool_call_id === 'string') wire.tool_call_id = raw.tool_call_id;
	if (typeof raw.name === 'string') wire.name = raw.name;
	if (includeReasoning && msg.role === 'assistant') {
		// Older/non-thinking replies have no saved reasoning. An empty field
		// keeps those histories usable without inventing reasoning text.
		wire.reasoning_content = typeof raw.reasoning_content === 'string' ? raw.reasoning_content : msg.reasoningContent ?? '';
	}

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

export function toOpenAiWireMessages(messages: LLMMessage[], includeReasoning = false): OpenAiWireMessage[] {
	return messages.map(message => toOpenAiWireMessage(message, includeReasoning));
}
