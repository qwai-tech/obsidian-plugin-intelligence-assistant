/**
 * Page Object for the Intelligence Assistant chat view.
 */

/** Find a button by partial text match. */
async function findButtonByText(text: string): Promise<WebdriverIO.Element> {
	const buttons = await $$('button');
	for (const btn of buttons) {
		const btnText = await btn.getText();
		if (btnText.toLowerCase().includes(text.toLowerCase())) {
			return btn;
		}
	}
	throw new Error(`Button containing "${text}" not found`);
}

/** Find the first select element. */
async function findSelect(): Promise<WebdriverIO.Element> {
	const selects = await $$('select');
	if (selects.length > 0) return selects[0];
	throw new Error('No select element found');
}

/** Find the second select element (for mode switching). */
async function findSecondSelect(): Promise<WebdriverIO.Element> {
	const selects = await $$('select');
	if (selects.length >= 2) return selects[1];
	throw new Error('Second select element not found');
}

export class ChatViewPage {
	private get container() { return $('.intelligence-assistant-chat-container'); }
	private get msgInput() { return $('.chat-input'); }
	private get sendBtn() { return $('.ia-send-btn'); }
	private get stopBtn() { return $('.stop-generation-btn'); }
	private get newChatBtn() { return $('button[title*="New"]'); }
	private get settingsBtn() { return $('button[title*="Settings"]'); }
	private get messageList() { return $('.ia-chat-messages'); }
	private get emptyState() { return $('.ia-chat-empty-state'); }
	private get scrollToBottomBtn() { return $('.ia-scroll-to-bottom'); }
	private get thinkingIndicator() { return $('.ia-thinking-indicator'); }

	async open(): Promise<void> {
		await browser.execute(() => {
			const app = (window as any).app;
			const leaves = app.workspace.getLeavesOfType('intelligence-assistant-chat');
			if (leaves.length === 0) {
				app.workspace.getLeaf('tab').setViewState({
					type: 'intelligence-assistant-chat',
					active: true,
				});
			} else {
				app.workspace.setActiveLeaf(leaves[0]);
			}
		});
		await browser.pause(1000);
		await this.container.waitForDisplayed({ timeout: 10000 });
	}

	async isOpen(): Promise<boolean> {
		return this.container.isDisplayed();
	}

	async sendMessage(text: string): Promise<void> {
		await this.msgInput.setValue(text);
		await this.sendBtn.click();
	}

	async newChat(): Promise<void> {
		await this.newChatBtn.click();
		await browser.pause(500);
	}

	async stopGeneration(): Promise<void> {
		await this.stopBtn.click();
	}

	async openHistory(): Promise<void> {
		const btn = await findButtonByText('Conversation');
		await btn.click();
	}

	async selectModel(modelLabel: string): Promise<void> {
		const sel = await findSelect();
		await sel.selectByVisibleText(modelLabel);
	}

	async getSelectedModel(): Promise<string> {
		const sel = await findSelect();
		return sel.getValue();
	}

	async switchMode(mode: 'chat' | 'agent'): Promise<void> {
		const modeSelect = await findSecondSelect();
		await modeSelect.click();
		const options = await modeSelect.$$('option');
		for (const opt of options) {
			const optText = await opt.getText();
			if (optText.toLowerCase() === mode.toLowerCase()) {
				await opt.click();
				return;
			}
		}
		throw new Error(`Mode "${mode}" option not found`);
	}

	async getMessageCount(): Promise<number> {
		const msgs = await $$('.ia-chat-message');
		return msgs.length;
	}

	async getMessages(): Promise<WebdriverIO.Element[]> {
		return $$('.ia-chat-message');
	}

	async getUserMessages(): Promise<WebdriverIO.Element[]> {
		return $$('.ia-chat-message--user');
	}

	async getAssistantMessages(): Promise<WebdriverIO.Element[]> {
		return $$('.ia-chat-message--assistant');
	}

	async getLastAssistantText(): Promise<string> {
		const msgs = await $$('.ia-chat-message--assistant');
		if (msgs.length === 0) return '';
		return msgs[msgs.length - 1].getText();
	}

	async isThinking(): Promise<boolean> {
		return this.thinkingIndicator.isDisplayed().catch(() => false);
	}

	async waitForReply(timeout = 30000): Promise<void> {
		await browser.waitUntil(
			async () => {
				const msgs = await $$('.ia-chat-message--assistant');
				return msgs.length > 0;
			},
			{ timeout, timeoutMsg: 'No assistant reply received' }
		);
	}

	async isSendEnabled(): Promise<boolean> {
		return this.sendBtn.isEnabled();
	}

	async isStopVisible(): Promise<boolean> {
		return this.stopBtn.isDisplayed().catch(() => false);
	}

	async scrollToBottom(): Promise<void> {
		await this.scrollToBottomBtn.click();
	}

	async isEmptyStateVisible(): Promise<boolean> {
		return this.emptyState.isDisplayed().catch(() => false);
	}

	async getToolTraces(): Promise<WebdriverIO.Element[]> {
		return $$('.ia-tool-execution-trace .ia-trace-item');
	}

	/** RAG toggle button in the chat input area */
	async toggleRag(): Promise<void> {
		const btn = await $('button[title*="RAG"]');
		await btn.click();
	}

	/** Web search toggle button in the chat input area */
	async toggleWebSearch(): Promise<void> {
		const btn = await $('button[title*="Web"]');
		await btn.click();
	}
}
