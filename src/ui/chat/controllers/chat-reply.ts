import { CompletionError } from '@qwai/obsidian-llm';
import type { LLMConfig } from '@/features/llm';
import type { Message } from '@/features/conversations';
import { errorMessage } from '@/core/utils/errors';

export interface Reply {
	ok: boolean;
	message: Message;
	element: HTMLElement;
}

export function errorReply(error: unknown, model: string, config: LLMConfig): Message {
	const failure = `❌ **Error:** ${errorMessage(error)}`;
	return { role: 'assistant', content: [error instanceof CompletionError ? error.partialContent : undefined, failure].filter(Boolean).join('\n\n'), model, provider: config.provider ?? undefined,
		tokenUsage: error instanceof CompletionError ? error.usage : undefined, reasoningContent: error instanceof CompletionError ? error.partialReasoning : undefined };
}
