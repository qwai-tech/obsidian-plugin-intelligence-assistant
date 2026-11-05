import type { TokenUsage } from './types';

/** Terminal provider failure with any genuine usage reported before the stream closed. */
export class CompletionError extends Error {
	override readonly name = 'CompletionError';
	readonly #partialContent?: string;
	readonly #partialReasoning?: string;
	get partialContent(): string | undefined { return this.#partialContent; }
	get partialReasoning(): string | undefined { return this.#partialReasoning; }
	constructor(readonly finishReason: string, readonly usage?: TokenUsage, partialContent?: string, partialReasoning?: string) {
		super(finishReason === 'length' || finishReason === 'max_tokens' || finishReason === 'MAX_TOKENS'
			? 'The response reached its output token limit, which can include model reasoning. Partial output is incomplete; increase Max Tokens or explicitly use a lower thinking budget.'
			: 'The service filtered this response before completion.');
		this.#partialContent = partialContent;
		this.#partialReasoning = partialReasoning;
	}
}
export function completionError(reason?: string, usage?: TokenUsage, partialContent?: string, partialReasoning?: string): CompletionError | undefined {
	if (reason && ['length', 'max_tokens', 'MAX_TOKENS', 'content_filter', 'SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT'].includes(reason)) return new CompletionError(reason, usage, partialContent, partialReasoning);
	return undefined;
}
/** Partial or filtered output must not be reported as a successfully finished answer. */
export function assertCompletionStatus(reason?: string, usage?: TokenUsage, partialContent?: string, partialReasoning?: string): void {
	const error = completionError(reason, usage, partialContent, partialReasoning);
	if (error) throw error;
}
