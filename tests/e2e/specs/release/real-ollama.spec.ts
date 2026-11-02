import { ChatViewPage } from '../../pages/chat/chat-view.page';
import { ChatReplyPage } from '../../pages/chat/chat-reply.page';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { FIXED_AGENT_ID, activateAgent, ollamaModels, seedOllama, skipUnlessOllama } from '../../support/ollama-env';

const GREEN_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsAtx/VMY0Ai+hcEKLJ2+FgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQGBywKhJcDEUyY2EgAAAABJRU5ErkJggg==';

describe('Release real Ollama', () => {
	const chat = new ChatViewPage();
	const reply = new ChatReplyPage();

	before(async function (this: Mocha.Context) {
		await skipUnlessOllama(this);
		await waitForPluginReady();
		await seedOllama();
	});

	beforeEach(async () => {
		await chat.open();
		await chat.newChat();
		await chat.selectMode('chat');
		await chat.selectModel(`ollama:${ollamaModels.chat}`);
	});

	it('saves the reply it just streamed into a new note with its body', async () => {
		await chat.sendMessage('Reply with exactly SAVE_LIVE_4417 and nothing else. /no_think');
		await chat.waitForReplyComplete(120_000);
		await chat.waitForAssistantText('SAVE_LIVE_4417', 5_000);

		await reply.saveLastReply('e2e-save-live-4417');

		expect(await reply.readNote('e2e-save-live-4417.md')).toContain('SAVE_LIVE_4417');
	});

	it('inserts the reply it just streamed into a new note with its body', async () => {
		await chat.sendMessage('Reply with exactly INSERT_LIVE_5517 and nothing else. /no_think');
		await chat.waitForReplyComplete(120_000);
		await chat.waitForAssistantText('INSERT_LIVE_5517', 5_000);

		await reply.insertLastReplyIntoNewNote('e2e-insert-live-5517');

		expect(await reply.readNote('e2e-insert-live-5517.md')).toContain('INSERT_LIVE_5517');
	});

	it('sends an attached image to the vision model', async () => {
		await reply.attachImage('green.png', GREEN_PNG);
		await chat.sendMessage('What single color fills this image? Answer with one word. /no_think');
		await chat.waitForReplyComplete(120_000);

		const answer = await reply.lastReply();
		expect(answer?.tokenUsage?.promptTokens ?? 0).toBeGreaterThan(60);
		expect(answer?.content.toLowerCase()).toContain('green');
	});

	it('answers with the agent\'s fixed model, not the model last picked in chat', async () => {
		await chat.selectMode('agent');
		await activateAgent(FIXED_AGENT_ID);

		await chat.sendMessage('Reply with exactly FIXED_MODEL_6632 and nothing else. /no_think');
		await chat.waitForReplyComplete(180_000);

		expect((await reply.lastReply())?.model).toBe(`ollama:${ollamaModels.fixed}`);
	});
});
