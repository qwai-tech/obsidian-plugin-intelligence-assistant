import { ChatView } from '@/presentation/views/chat-view';

describe('ChatView lifecycle', () => {
	it('leaves the plugin-owned RAG manager running when the view closes', async () => {
		const ragManager = { destroy: jest.fn(async () => undefined) };
		const view = {
			ragManager,
			plugin: { saveSettings: jest.fn(async () => undefined) },
		};

		await ChatView.prototype.onClose.call(view);

		expect(ragManager.destroy).not.toHaveBeenCalled();
	});
});
