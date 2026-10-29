import { ConversationNamer, type NamingSettings } from '@/application/services/conversation-namer';
import type { Message } from '@/types';

const settings = (overrides: Partial<NamingSettings> = {}): NamingSettings => ({
	conversationTitleMode: 'llm-summary',
	titleSummaryModel: 'openai:gpt-4o-mini',
	titleSummaryPrompt: 'Title for:\n{conversation}',
	llmConfigs: [{ provider: 'openai', apiKey: 'k', cachedModels: [{ id: 'openai:gpt-4o-mini', name: 'mini', provider: 'openai', capabilities: [] }] }],
	...overrides,
});

const providerReplying = (content: string) => ({ chat: jest.fn(async () => ({ content })) });

const messages: Message[] = [
	{ role: 'user', content: 'How do I split my Q3 research notes into topics?' },
	{ role: 'assistant', content: 'Start by listing the themes.' },
];

describe('ConversationNamer', () => {
	it('uses the first user message, shortened, in first-message mode', async () => {
		const namer = new ConversationNamer(() => settings({ conversationTitleMode: 'first-message' }));

		expect(await namer.title(messages, 'x')).toBe('How do I split my Q3 research notes into topics?');
		expect(await namer.title([{ role: 'user', content: 'y'.repeat(80) }], 'x')).toBe(`${'y'.repeat(50)}...`);
	});

	it('asks the title model and cleans its reply', async () => {
		const provider = providerReplying('Title: "Splitting Q3 research"');
		const namer = new ConversationNamer(() => settings(), () => provider as never);

		expect(await namer.title(messages, 'fallback-model')).toBe('Splitting Q3 research');
		const prompt = (provider.chat.mock.calls[0][0] as { messages: Message[] }).messages[0].content;
		expect(prompt).toContain('user: How do I split');
	});

	it('falls back to the first message when the model fails', async () => {
		const namer = new ConversationNamer(() => settings(), () => ({ chat: jest.fn(async () => { throw new Error('offline'); }) }) as never);
		jest.spyOn(console, 'error').mockImplementation(() => undefined);

		expect(await namer.title(messages, 'x')).toBe('How do I split my Q3 research notes into topics?');
	});

	it('picks the first emoji of the model reply as the icon', async () => {
		const namer = new ConversationNamer(() => settings(), () => providerReplying('Sure: 📚 books') as never);

		expect(await namer.icon('Reading list', 'x')).toBe('📚');
	});

	it('has no icon when no model can be resolved', async () => {
		const namer = new ConversationNamer(() => settings({ titleSummaryModel: undefined, llmConfigs: [] }), () => providerReplying('📚') as never);

		expect(await namer.icon('Reading list', '')).toBeNull();
	});
});
