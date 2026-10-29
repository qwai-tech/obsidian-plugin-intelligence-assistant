import type { ConversationConfig } from '@/features/conversations/types/conversation';
import type { ChatViewState } from '@/ui/state/chat-view-state';

const SAMPLING_KEYS = ['temperature', 'maxTokens', 'topP', 'frequencyPenalty', 'presencePenalty'] as const;

export function applyConversationSettings(state: ChatViewState, config: ConversationConfig, mode: 'chat' | 'agent'): void {
	for (const key of SAMPLING_KEYS) {
		const value = config[key];
		if (typeof value === 'number') {
			state[key] = value;
		}
	}
	if (mode !== 'agent') {
		if (typeof config.ragEnabled === 'boolean') state.enableRAG = config.ragEnabled;
		if (typeof config.webSearchEnabled === 'boolean') state.enableWebSearch = config.webSearchEnabled;
	}
}
