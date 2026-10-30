import type { LLMConfig } from '@/features/llm';
import type { Message } from '@/features/conversations';
import { errorMessage } from '@/core/utils/errors';

export interface Reply {
	ok: boolean;
	message: Message;
	element: HTMLElement;
}

export function errorReply(error: unknown, model: string, config: LLMConfig): Message {
	return { role: 'assistant', content: `❌ **Error:** ${errorMessage(error)}`, model, provider: config.provider ?? undefined };
}
