/**
 * ConversationStorageService unit tests
 */

import { ConversationStorageService } from '../../application/services/conversation-storage-service';
import type { Conversation } from '../../types/core/conversation';

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
	return {
		id: 'conv-1',
		title: 'Test Conversation',
		messages: [],
		createdAt: 1000,
		updatedAt: 1000,
		mode: 'chat',
		...overrides
	};
}

function makeApp(files: Record<string, string> = {}) {
	const store: Record<string, string> = { ...files };
	const adapter = {
		exists: jest.fn(async (path: string) => path in store),
		read: jest.fn(async (path: string) => {
			if (!(path in store)) throw new Error(`File not found: ${path}`);
			return store[path];
		}),
		write: jest.fn(async (path: string, data: string) => { store[path] = data; }),
		remove: jest.fn(async (path: string) => { delete store[path]; }),
		mkdir: jest.fn(async () => {}),
		list: jest.fn(async () => ({ files: [], folders: [] })),
	};
	const vault = {
		adapter,
		createFolder: jest.fn(async () => {}),
	};
	return {
		app: { vault } as any,
		adapter,
		vault,
		store,
	};
}

describe('ConversationStorageService', () => {
	describe('createConversation', () => {
		it('creates conversation file and updates index', async () => {
			const { app, adapter } = makeApp();
			const svc = new ConversationStorageService(app);
			await svc.initialize();

			const conv = makeConversation();
			await svc.createConversation(conv);

			const writeCalls = (adapter.write as jest.Mock).mock.calls as [string, string][];

			// A conversation file should be written (path includes conv id)
			const convFile = writeCalls.find(([path]) => path.includes(conv.id));
			expect(convFile).toBeDefined();

			// The LAST index write should record the conversation
			const indexCalls = writeCalls.filter(([path]) => path.includes('conversation-index'));
			expect(indexCalls.length).toBeGreaterThan(0);
			const lastIndexWrite = indexCalls[indexCalls.length - 1];
			const index = JSON.parse(lastIndexWrite[1]) as { conversations: Array<{ id: string }> };
			expect(index.conversations.some(c => c.id === conv.id)).toBe(true);
		});
	});

	describe('loadConversation', () => {
		it('returns null for unknown conversation id', async () => {
			const { app } = makeApp();
			const svc = new ConversationStorageService(app);
			await svc.initialize();

			const result = await svc.loadConversation('nonexistent');
			expect(result).toBeNull();
		});

		it('round-trips a conversation through create then load', async () => {
			const { app } = makeApp();
			const svc = new ConversationStorageService(app);
			await svc.initialize();

			const conv = makeConversation({ messages: [{ role: 'user', content: 'hello' }] });
			await svc.createConversation(conv);

			const loaded = await svc.loadConversation(conv.id);
			expect(loaded).not.toBeNull();
			expect(loaded!.id).toBe(conv.id);
			expect(loaded!.messages[0].content).toBe('hello');
		});
	});

	describe('updateConversation', () => {
		it('updates conversation content and metadata', async () => {
			const { app } = makeApp();
			const svc = new ConversationStorageService(app);
			await svc.initialize();

			const conv = makeConversation();
			await svc.createConversation(conv);

			const updated = { ...conv, title: 'Updated Title', updatedAt: 2000 };
			await svc.updateConversation(updated);

			const loaded = await svc.loadConversation(conv.id);
			expect(loaded!.title).toBe('Updated Title');
		});

		it('throws when updating a conversation not in the index', async () => {
			const { app } = makeApp();
			const svc = new ConversationStorageService(app);
			await svc.initialize();

			await expect(
				svc.updateConversation(makeConversation({ id: 'ghost' }))
			).rejects.toThrow('ghost');
		});
	});

	describe('deleteConversation', () => {
		it('removes conversation from index and returns true', async () => {
			const { app } = makeApp();
			const svc = new ConversationStorageService(app);
			await svc.initialize();

			const conv = makeConversation();
			await svc.createConversation(conv);

			const result = await svc.deleteConversation(conv.id);
			expect(result).toBe(true);

			const loaded = await svc.loadConversation(conv.id);
			expect(loaded).toBeNull();
		});

		it('returns false for unknown conversation id', async () => {
			const { app } = makeApp();
			const svc = new ConversationStorageService(app);
			await svc.initialize();

			const result = await svc.deleteConversation('ghost');
			expect(result).toBe(false);
		});
	});

	describe('listConversations', () => {
		it('returns empty list when no conversations created', async () => {
			const { app } = makeApp();
			const svc = new ConversationStorageService(app);
			await svc.initialize();

			const list = await svc.getAllConversationsMetadata();
			expect(list).toEqual([]);
		});

		it('lists all created conversations sorted by updatedAt descending', async () => {
			const { app } = makeApp();
			const svc = new ConversationStorageService(app);
			await svc.initialize();

			await svc.createConversation(makeConversation({ id: 'a', updatedAt: 1000 }));
			await svc.createConversation(makeConversation({ id: 'b', updatedAt: 3000 }));
			await svc.createConversation(makeConversation({ id: 'c', updatedAt: 2000 }));

			const list = await svc.getAllConversationsMetadata();
			// sorted by updatedAt descending: b(3000) > c(2000) > a(1000)
			expect(list.map((c: { id: string }) => c.id)).toEqual(['b', 'c', 'a']);
		});
	});

	describe('write lock (concurrency)', () => {
		it('serializes concurrent createConversation calls', async () => {
			const { app } = makeApp();
			const svc = new ConversationStorageService(app);
			await svc.initialize();

			// Fire 5 creates in parallel — all should succeed
			await Promise.all([
				svc.createConversation(makeConversation({ id: 'p1' })),
				svc.createConversation(makeConversation({ id: 'p2' })),
				svc.createConversation(makeConversation({ id: 'p3' })),
				svc.createConversation(makeConversation({ id: 'p4' })),
				svc.createConversation(makeConversation({ id: 'p5' })),
			]);

			const list = await svc.getAllConversationsMetadata();
			expect(list).toHaveLength(5);
		});
	});
});
