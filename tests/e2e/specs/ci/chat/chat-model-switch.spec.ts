import { ChatViewPage } from '../../../pages/chat-view.page';

describe('Chat - Model Switching', () => {
	let chatPage: ChatViewPage;

	before(async () => {
		chatPage = new ChatViewPage();
		await chatPage.open();
	});

	it('should display the model selector', async () => {
		const model = await chatPage.getSelectedModel();
		expect(model.length).toBeGreaterThan(0);
	});

	it('should allow selecting a different model', async () => {
		const original = await chatPage.getSelectedModel();
		// Try to select a different option
		const options = await $$('.ia-model-select option');
		if (options.length > 1) {
			const secondLabel = await options[1].getText();
			await chatPage.selectModel(secondLabel);
			await browser.pause(500);
			const updated = await chatPage.getSelectedModel();
			expect(updated).not.toBe(original);
		}
	});
});
