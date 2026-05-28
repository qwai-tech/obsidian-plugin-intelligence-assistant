import { BasePage } from '../base.page';
import { TestIds } from '../../support/testids';

const PLUGIN_VIEW_TYPE = 'intelligence-assistant-chat';

export interface ChatMessage {
	role: 'user' | 'assistant';
	text: string;
}

export class ChatViewPage extends BasePage {
	/** Open the chat view via Obsidian's workspace API. */
	async open(): Promise<void> {
		await browser.execute((viewType) => {
			const app = (window as unknown as {
				app: {
					workspace: {
						getLeavesOfType(t: string): unknown[];
						getLeaf(action: string): {
							setViewState(state: { type: string; active: boolean }): Promise<void>;
						};
						setActiveLeaf(leaf: unknown): void;
					};
				};
			}).app;
			const existing = app.workspace.getLeavesOfType(viewType);
			if (existing.length > 0) {
				app.workspace.setActiveLeaf(existing[0]);
				return;
			}
			void app.workspace.getLeaf('tab').setViewState({ type: viewType, active: true });
		}, PLUGIN_VIEW_TYPE);
		await this.waitFor(TestIds.chat.container);
	}

	async newChat(): Promise<void> {
		await this.click(TestIds.chat.newBtn);
		await this.waitFor(TestIds.chat.emptyState);
	}

	async sendMessage(text: string): Promise<void> {
		await this.type(TestIds.chat.input, text);
		await this.click(TestIds.chat.sendBtn);
	}

	async waitForReplyComplete(timeoutMs = 15_000): Promise<void> {
		await browser.waitUntil(
			async () => {
				const count = await this.$$testid(TestIds.chat.message).length;
				if (count < 2) return false;
				const stopVisible = await this.isVisible(TestIds.chat.stopBtn);
				return !stopVisible;
			},
			{ timeout: timeoutMs, timeoutMsg: 'Assistant reply did not complete' }
		);
	}

	async getMessages(): Promise<ChatMessage[]> {
		const out: ChatMessage[] = [];
		const elems = await this.$$testid(TestIds.chat.message).getElements();
		for (const el of elems) {
			const role = (await el.getAttribute('data-role')) as 'user' | 'assistant';
			let text = await browser.execute((node: HTMLElement) => {
				const content = node.querySelector('[data-message-content]') as HTMLElement | null;
				const source = content ?? node;
				return (source.innerText || source.textContent || '').trim();
			}, el);
			if (!text) text = (await el.getText()).trim();
			out.push({ role, text });
		}
		return out;
	}

	async getConversationId(): Promise<string> {
		return browser.execute(() => {
			const app = (window as unknown as {
				app: { plugins: { plugins: Record<string, {
					settings?: { activeConversationId?: string | null };
				}> } };
			}).app;
			const plugin = app.plugins.plugins['intelligence-assistant'];
			return plugin?.settings?.activeConversationId ?? '';
		});
	}

	async isInputVisible(): Promise<boolean> { return this.isVisible(TestIds.chat.input); }
	async isSendBtnPresent(): Promise<boolean> { return this.$testid(TestIds.chat.sendBtn).isExisting(); }
	async isEmptyStateVisible(): Promise<boolean> { return this.isVisible(TestIds.chat.emptyState); }
	async isModelSelectPresent(): Promise<boolean> { return this.$testid(TestIds.chat.modelSelect).isExisting(); }
	async isModeSelectPresent(): Promise<boolean> { return this.$testid(TestIds.chat.modeSelect).isExisting(); }
	async isContainerVisible(): Promise<boolean> { return this.isVisible(TestIds.chat.container); }
}
