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

	async openConversationList(): Promise<void> {
		await this.click(TestIds.chat.conversationToggleBtn);
		await browser.waitUntil(
			async () => browser.execute((testId) => {
				const list = activeDocument.querySelector(`[data-testid="${testId}"]`);
				return list instanceof HTMLElement
					&& list.classList.contains('is-open')
					&& !list.classList.contains('is-collapsed');
			}, TestIds.chat.conversationList),
			{ timeout: 10_000, timeoutMsg: 'Conversation list did not open' }
		);
	}

	async switchConversation(conversationId: string): Promise<void> {
		await this.openConversationList();
		await browser.waitUntil(
			async () => browser.execute((testId, id) => {
				return Array.from(activeDocument.querySelectorAll(`[data-testid="${testId}"]`))
					.some(item => item.instanceOf(HTMLElement) && item.getAttribute('data-conv-id') === id);
			}, TestIds.chat.conversationItem, conversationId),
			{ timeout: 10_000, timeoutMsg: `Conversation item not found: ${conversationId}` }
		);
		await browser.execute((testId, id) => {
			const item = Array.from(activeDocument.querySelectorAll(`[data-testid="${testId}"]`))
				.find(candidate => candidate.instanceOf(HTMLElement) && candidate.getAttribute('data-conv-id') === id);
			if (!(item instanceof HTMLElement)) {
				throw new Error(`Conversation item not found: ${id}`);
			}
			item.click();
		}, TestIds.chat.conversationItem, conversationId);
		await browser.waitUntil(
			async () => (await this.getConversationId()) === conversationId,
			{ timeout: 10_000, timeoutMsg: `Conversation did not switch to ${conversationId}` }
		);
	}

	async sendMessage(text: string): Promise<void> {
		await this.type(TestIds.chat.input, text);
		await this.click(TestIds.chat.sendBtn);
	}

	async selectModel(modelId: string): Promise<void> {
		await this.waitFor(TestIds.chat.modelSelect);
		await browser.execute((testId, value) => {
			const select = activeDocument.querySelector(`[data-testid="${testId}"]`);
			if (!(select instanceof HTMLSelectElement)) {
				throw new Error(`Model select not found: ${testId}`);
			}
			select.value = value;
			select.dispatchEvent(new Event('change', { bubbles: true }));
		}, TestIds.chat.modelSelect, modelId);
	}

	async selectMode(mode: 'chat' | 'agent'): Promise<void> {
		await this.waitFor(TestIds.chat.modeSelect);
		await browser.execute((testId, value) => {
			const select = activeDocument.querySelector(`[data-testid="${testId}"]`);
			if (!(select instanceof HTMLSelectElement)) {
				throw new Error(`Mode select not found: ${testId}`);
			}
			select.value = value;
			select.dispatchEvent(new Event('change', { bubbles: true }));
		}, TestIds.chat.modeSelect, mode);
		await browser.waitUntil(
			async () => browser.execute((testId, expectedMode) => {
				const select = activeDocument.querySelector(`[data-testid="${testId}"]`);
				if (!(select instanceof HTMLSelectElement) || select.value !== expectedMode) return false;
				const plugin = (window as unknown as {
					app: { plugins: { plugins: Record<string, { settings?: { activeAgentId?: string | null } }> } };
				}).app.plugins.plugins['intelligence-assistant'];
				return expectedMode === 'chat' || Boolean(plugin?.settings?.activeAgentId);
			}, TestIds.chat.modeSelect, mode),
			{ timeout: 10_000, timeoutMsg: `Chat mode did not switch to ${mode}` }
		);
	}

	async enableRag(): Promise<void> {
		await this.waitFor(TestIds.chat.ragToggleBtn);
		await browser.waitUntil(
			async () => browser.execute((testId) => {
				const button = activeDocument.querySelector(`[data-testid="${testId}"]`);
				return button instanceof HTMLElement && !button.classList.contains('ia-hidden');
			}, TestIds.chat.ragToggleBtn),
			{ timeout: 10_000, timeoutMsg: 'RAG toggle was not visible' }
		);
		const active = await browser.execute((testId) => {
			const button = activeDocument.querySelector(`[data-testid="${testId}"]`);
			return button instanceof HTMLElement && button.classList.contains('is-active');
		}, TestIds.chat.ragToggleBtn);
		if (!active) {
			await this.click(TestIds.chat.ragToggleBtn);
		}
		await browser.waitUntil(
			async () => browser.execute((testId) => {
				const button = activeDocument.querySelector(`[data-testid="${testId}"]`);
				return button instanceof HTMLElement && button.classList.contains('is-active');
			}, TestIds.chat.ragToggleBtn),
			{ timeout: 10_000, timeoutMsg: 'RAG toggle did not become active' }
		);
	}

	async getSelectedModel(): Promise<string> {
		await this.waitFor(TestIds.chat.modelSelect);
		return browser.execute((testId) => {
			const select = activeDocument.querySelector(`[data-testid="${testId}"]`);
			if (!(select instanceof HTMLSelectElement)) {
				return '';
			}
			return select.value;
		}, TestIds.chat.modelSelect);
	}

	async stopGeneration(): Promise<void> {
		await this.click(TestIds.chat.stopBtn);
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

	async waitForAssistantText(text: string, timeoutMs = 10_000): Promise<void> {
		await browser.waitUntil(
			async () => (await this.getLastAssistantText()).includes(text),
			{ timeout: timeoutMs, timeoutMsg: `Assistant text did not contain "${text}"` }
		);
	}

	async getMessages(): Promise<ChatMessage[]> {
		const out: ChatMessage[] = [];
		const elems = await this.$$testid(TestIds.chat.message).getElements();
		for (const el of elems) {
			const role = (await el.getAttribute('data-role')) as 'user' | 'assistant';
			let text = await browser.execute((node: HTMLElement) => {
				const content = node.querySelector('[data-message-content]');
				const source = content instanceof HTMLElement ? content : node;
				return (source.innerText || source.textContent || '').trim();
			}, el);
			if (!text) text = (await el.getText()).trim();
			out.push({ role, text });
		}
		return out;
	}

	async getLastAssistantText(): Promise<string> {
		const assistants = (await this.getMessages()).filter((message) => message.role === 'assistant');
		return assistants[assistants.length - 1]?.text ?? '';
	}

	async getToolTraceText(): Promise<string> {
		await this.$testid(TestIds.chat.agentTrace).waitForExist({ timeout: 10_000 });
		return browser.execute((testId) => {
			const trace = activeDocument.querySelector(`[data-testid="${testId}"]`);
			return trace instanceof HTMLElement ? (trace.textContent || '').trim() : '';
		}, TestIds.chat.agentTrace);
	}

	async getRagSourceText(): Promise<string> {
		await this.$testid(TestIds.chat.ragSources).waitForExist({ timeout: 10_000 });
		return browser.execute((testId) => {
			const sourceList = activeDocument.querySelector(`[data-testid="${testId}"]`);
			return sourceList instanceof HTMLElement ? (sourceList.innerText || sourceList.textContent || '').trim() : '';
		}, TestIds.chat.ragSources);
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
	async isStopBtnVisible(): Promise<boolean> { return this.isVisible(TestIds.chat.stopBtn); }
	async isEmptyStateVisible(): Promise<boolean> { return this.isVisible(TestIds.chat.emptyState); }
	async isModelSelectPresent(): Promise<boolean> { return this.$testid(TestIds.chat.modelSelect).isExisting(); }
	async isModeSelectPresent(): Promise<boolean> { return this.$testid(TestIds.chat.modeSelect).isExisting(); }
	async isContainerVisible(): Promise<boolean> { return this.isVisible(TestIds.chat.container); }
}
