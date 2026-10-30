import { ConversationMigrationService } from '@/adapters/persistence/conversation-migration-service';
import type { Conversation } from '@/features/conversations';

describe('ConversationMigrationService', () => {
	it('creates the legacy conversations that do not exist yet and skips the rest', async () => {
		const existing = new Set(['kept']);
		const storage = {
			getConversationMetadata: jest.fn(async (id: string) => (existing.has(id) ? { id } : null)),
			createConversation: jest.fn(async (conversation: Conversation) => { existing.add(conversation.id); }),
		};
		const migration = new ConversationMigrationService(storage as never);

		const ok = await migration.migrateFromOldFormat([
			{ id: 'kept', title: 'Already migrated', messages: [], createdAt: 1, updatedAt: 1 },
			{ id: 'new', title: 'Old chat', messages: [], createdAt: 1, updatedAt: 1 },
		]);

		expect(ok).toBe(true);
		expect(storage.createConversation.mock.calls.map(([conversation]) => conversation.id)).toEqual(['new']);
	});
});
