describe('Accessibility', () => {
	it('should open the chat view', async () => {
		await browser.execute(() => {
			const app = (window as any).app;
			const leaves = app.workspace.getLeavesOfType('intelligence-assistant-chat');
			if (leaves.length === 0) {
				app.workspace.getLeaf('tab').setViewState({
					type: 'intelligence-assistant-chat',
					active: true,
				});
			}
		});
		await browser.pause(1000);
	});

	it('should have a textarea for chat input', async () => {
		const input = await $('.chat-input');
		const exists = await input.isExisting();
		expect(exists).toBe(true);
	});

	it('input should be focusable', async () => {
		const input = await $('.chat-input');
		await input.click();
		const focused = await browser.execute(() => document.activeElement?.tagName);
		expect(focused).toBe('TEXTAREA');
	});
});
