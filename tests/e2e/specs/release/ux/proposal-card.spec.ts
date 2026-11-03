import { ChatViewPage } from '../../../pages/chat/chat-view.page';
import { ChatReplyPage } from '../../../pages/chat/chat-reply.page';
import { waitForPluginReady } from '../../../support/plugin-helpers';
import { WRITER_AGENT, WRITER_AGENT_ID, activateAgent, seedOllama, skipUnlessOllama } from '../../../support/ollama-env';

describe('UX review: write proposal card', () => {
	const chat = new ChatViewPage();
	const reply = new ChatReplyPage();

	before(async function (this: Mocha.Context) {
		await skipUnlessOllama(this);
		await waitForPluginReady();
		await seedOllama([WRITER_AGENT]);
	});

	it('#3 stops saying the write was not applied once it has been applied', async function (this: Mocha.Context) {
		this.timeout(600_000);
		await chat.open();
		await chat.newChat();
		await chat.selectMode('agent');
		await activateAgent(WRITER_AGENT_ID);
		await reply.allowReplyTokens(8_000);

		await chat.sendMessage('Call the create_note tool exactly once with title "ux-proposal-7731" and content "UX_PROPOSAL_7731". Then reply with one short sentence. /no_think');
		await chat.waitForReplyComplete(540_000);
		await reply.waitForProposalCard();

		const [before] = await reply.proposalCards();
		expect(before.button).toBe('Apply');
		await reply.applyFirstProposal();

		expect(await reply.readNote('ux-proposal-7731.md')).toContain('UX_PROPOSAL_7731');
		const [after] = await reply.proposalCards();
		expect(after.text).not.toMatch(/not applied/i);

		const conversationId = await chat.getConversationId();
		await chat.newChat();
		await chat.switchConversation(conversationId);
		await reply.waitForProposalCard();
		expect(await reply.proposalCards()).toEqual([after]);
	});
});
