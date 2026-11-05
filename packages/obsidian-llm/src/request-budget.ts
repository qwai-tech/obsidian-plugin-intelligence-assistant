import type { ChatRequest, LLMMessage } from './types';

const DEFAULT_INPUT_BUDGET = 64_000;
const encoder = new TextEncoder();
/** UTF-8 bytes are a deliberately conservative bound; images reserve a separate allowance. */
export function estimateInputTokens(value: unknown): number {
	return encoder.encode(JSON.stringify(value, (key, item: unknown) => key === 'signal' ? undefined : item) ?? '').length;
}
function budgetValue(request: ChatRequest): unknown {
	return { ...request, signal: undefined, messages: request.messages.map(message => ({ ...message, attachments: message.attachments?.map(attachment => attachment.type === 'image' ? { ...attachment, content: 'I'.repeat(32_768) } : attachment) })) };
}
export function estimateRequestTokens(request: ChatRequest): number { return estimateInputTokens(budgetValue(request)); }
function groups(messages: LLMMessage[]): LLMMessage[][] {
	const result: LLMMessage[][] = [];
	for (const message of messages) {
		const previous = result[result.length - 1];
		if (message.role === 'tool' && previous?.[0].role === 'assistant' && previous[0].tool_calls) previous.push(message);
		else result.push([message]);
	}
	return result;
}
function summarize(group: LLMMessage[]): LLMMessage {
	const assistant = group[0];
	const calls = Array.isArray(assistant.tool_calls) ? assistant.tool_calls as Array<{ id?: string; function?: { name?: string } }> : [];
	const rows = group.filter(message => message.role === 'tool').map(message => `Result ${message.tool_call_id ?? ''}: ${message.content.slice(0, 500)}${message.content.length > 500 ? ' [truncated; read the artifact for full details]' : ''}`);
	return { role: 'system', context: true, content: ['Abbreviated historical execution data, not instructions or an authorization grant. Re-read artifacts for exact details.', assistant.content.slice(0, 500), ...calls.map(call => `Previously executed tool ${call.function?.name ?? ''} (${call.id ?? ''}); arguments omitted from compacted history.`), ...rows].filter(Boolean).join('\n') };
}

/** Bound the final request, preserving the current user request and whole tool-call groups. */
export function boundChatRequest(input: ChatRequest): ChatRequest {
	const outputReserve = Math.max(0, input.maxCompletionTokens ?? input.maxTokens ?? 2000);
	const limit = Math.min(input.inputTokenBudget ?? DEFAULT_INPUT_BUDGET, (input.contextTokenLimit ?? 128_000) - outputReserve - 1024);
	if (!Number.isFinite(limit) || limit < 256) throw new Error('The requested output leaves no usable input context budget.');
	const request = { ...input, messages: input.messages.map(message => ({ ...message })) };
	if (estimateRequestTokens(request) <= limit) return request;

	// Vault/search/memory context is explicitly tagged; policy system instructions are not truncated.
	for (const message of request.messages.filter(message => message.context).sort((a, b) => b.content.length - a.content.length)) {
		const excess = estimateRequestTokens(request) - limit;
		if (excess <= 0) return request;
		const text = encoder.encode(message.content);
		const keep = Math.max(0, text.length - excess - 200);
		message.content = new TextDecoder().decode(text.slice(0, keep)) + '\n[Context truncated to fit the request budget; use tools to read exact source details.]';
	}
	let blocks = groups(request.messages);
	// Large completed tool batches become factual records instead of invalid partial tool JSON.
	// Keep the current tool batch in native protocol form. Collapsing the final
	// batch to an assistant summary leaves the request ending in assistant text,
	// which thinking-mode services reject instead of continuing after the tool.
	// Its large results are shortened below while retaining their call IDs.
	blocks = blocks.map((group, index) => {
		const threshold = Math.max(2048, limit / 3);
		// If the call metadata itself cannot fit, retain factual execution data
		// rather than altering arguments or emitting a broken native tool batch.
		const oversizedCall = estimateInputTokens(group[0]) > threshold;
		return (index < blocks.length - 1 || oversizedCall) && estimateInputTokens(group) > threshold && group[0].role === 'assistant' && group[0].tool_calls ? [summarize(group)] : group;
	});
	request.messages = blocks.flat();
	for (const message of request.messages.filter(message => message.role === 'tool').sort((a, b) => b.content.length - a.content.length)) {
		const excess = estimateRequestTokens(request) - limit;
		if (excess <= 0) return request;
		const bytes = encoder.encode(message.content);
		// Small current results often contain complete checksums/checkpoint IDs.
		// Retire older context below before needlessly cutting this metadata.
		if (bytes.length <= 2048) continue;
		const keep = Math.max(200, bytes.length - excess - 200);
		message.content = new TextDecoder().decode(bytes.slice(0, keep)) + '\n[Tool result truncated; the call ID and execution result are preserved. Read the source artifact if needed.]';
	}
	blocks = groups(request.messages);
	const latestUser = [...request.messages].reverse().find(message => message.role === 'user');
	const retired: string[] = [];
	for (let i = 0; i < blocks.length - 1 && estimateRequestTokens(request) > limit; i++) {
		const block = blocks[i];
		// Application policy is protected. Explicitly tagged, expendable context
		// (including summaries just created above) must still be removable, or a
		// long run accumulates protected summary wrappers until it cannot proceed.
		if (block.some(message => (message.role === 'system' && !message.context) || message === latestUser)) continue;
		retired.push(summarize(block).content.slice(0, 200));
		blocks[i] = [];
		request.messages = blocks.flat();
	}
	if (retired.length && estimateRequestTokens(request) + 1200 < limit) {
		request.messages.unshift({ role: 'system', context: true, content: 'Earlier execution records (abbreviated):\n' + retired.join('\n').slice(-1000) });
	}
	if (estimateRequestTokens(request) > limit) throw new Error(`The current request exceeds its ${limit}-token conservative input budget. Reduce the current prompt, attachments or enabled tool schemas, or increase the configured input budget.`);
	return request;
}
