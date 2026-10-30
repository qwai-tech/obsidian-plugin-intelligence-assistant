import { ChatView } from '@/ui/views/chat-view';

describe('ChatView lifecycle', () => {
	it('leaves the plugin-owned RAG manager running when the view closes', async () => {
		const ragManager = { destroy: jest.fn(async () => undefined) };
		const view = {
			ragManager,
			plugin: {},
		};

		await ChatView.prototype.onClose.call(view);

		expect(ragManager.destroy).not.toHaveBeenCalled();
	});

	it('listens for outside clicks on the document that holds the view', () => {
		const popout = document.implementation.createHTMLDocument('popout');
		const containerEl = popout.createElement('div');
		const view = {
			containerEl,
			registerDomEvent: jest.fn(),
		};

		(ChatView.prototype as unknown as { registerOutsideClickToCloseConversations(this: unknown): void })
			.registerOutsideClickToCloseConversations.call(view);

		expect(view.registerDomEvent).toHaveBeenCalledWith(popout, 'click', expect.any(Function));
	});
});
