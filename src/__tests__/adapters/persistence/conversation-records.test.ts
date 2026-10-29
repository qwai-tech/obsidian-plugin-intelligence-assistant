import { buildMetadata, conversationFileName, hasMetadataChanged, normalizeConversation } from '@/adapters/persistence/conversation-records';
import type { Conversation } from '@/features/conversations/types/conversation';

const conversation = (overrides: Partial<Conversation> = {}): Conversation => ({
	id: 'conv_1/x',
	title: 'Notes',
	messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo', model: 'gpt-4o' }],
	createdAt: new Date(2026, 9, 29).getTime(),
	updatedAt: 5,
	...overrides,
});

describe('conversation records', () => {
	it('fills defaults and drops unknown config fields when normalizing', () => {
		const normalized = normalizeConversation({ id: 'c', title: '', messages: undefined as never, createdAt: 1, updatedAt: 2, config: { promptId: '', agentId: null, temperature: 0.4, topP: 1 } });

		expect(normalized.title).toBe('Untitled Conversation');
		expect(normalized.messages).toEqual([]);
		expect(normalized.mode).toBe('chat');
		expect(normalized.config).toEqual({ modelId: undefined, promptId: undefined, agentId: null, temperature: 0.4, maxTokens: undefined, ragEnabled: undefined, webSearchEnabled: undefined });
	});

	it('builds metadata with the last assistant model when no model is configured', () => {
		expect(buildMetadata(conversation(), 'f.json')).toMatchObject({ id: 'conv_1/x', file: 'f.json', messageCount: 2, model: 'gpt-4o', mode: 'chat' });
	});

	it('detects metadata changes', () => {
		const meta = buildMetadata(conversation(), 'f.json');
		expect(hasMetadataChanged(meta, { ...meta })).toBe(false);
		expect(hasMetadataChanged(meta, { ...meta, title: 'New' })).toBe(true);
	});

	it('names files by creation date with the next free sequence and a safe id', () => {
		const index = { version: '2.0', conversations: [buildMetadata(conversation(), '2026-10-29-002-old.json')] };

		expect(conversationFileName(conversation(), index)).toBe('2026-10-29-003-conv_1-x.json');
	});
});
