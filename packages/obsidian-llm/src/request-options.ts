import type { ChatRequest } from './types';
const COMMON = new Set(['messages', 'model', 'signal', 'temperature', 'maxTokens', 'stream', 'inputTokenBudget', 'contextTokenLimit', 'conversationId', 'purpose', 'topP', 'stop', 'stopSequences', 'responseFormat', 'tools', 'toolChoice']);
/** Reject meaningful unsupported settings instead of silently pretending to apply them. */
export function assertRequestOptions(protocol: string, request: ChatRequest, extra: Array<keyof ChatRequest> = []): void {
	const allowed = new Set([...COMMON, ...extra]);
	for (const [key, value] of Object.entries(request)) {
		if (value === undefined || allowed.has(key)) continue;
		if ((key === 'frequencyPenalty' || key === 'presencePenalty') && value === 0) continue;
		throw new Error(`${protocol} does not support the configured request option: ${key}`);
	}
}
