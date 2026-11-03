import { BasePage } from '../base.page';

const PLUGIN_VIEW_TYPE = 'intelligence-assistant-chat';

export interface LiveMessage {
	role: string;
	content: string;
	model?: string;
	tokenUsage?: { promptTokens?: number };
}

interface ChatLeaf {
	view: { state: { messages: LiveMessage[]; currentAttachments: unknown[]; maxTokens: number } };
}

type ChatWindow = { app: { workspace: { getLeavesOfType(type: string): ChatLeaf[] } } };

export class ChatReplyPage extends BasePage {
	async allowReplyTokens(maxTokens: number): Promise<void> {
		await browser.execute((viewType, tokens) => {
			(window as unknown as ChatWindow).app.workspace.getLeavesOfType(viewType)[0].view.state.maxTokens = tokens;
		}, PLUGIN_VIEW_TYPE, maxTokens);
	}

	async attachImage(name: string, dataUrl: string): Promise<void> {
		await browser.execute((viewType, imageName, content) => {
			const leaf = (window as unknown as ChatWindow).app.workspace.getLeavesOfType(viewType)[0];
			leaf.view.state.currentAttachments.push({ type: 'image', name: imageName, path: imageName, content });
		}, PLUGIN_VIEW_TYPE, name, dataUrl);
	}

	async lastReply(): Promise<LiveMessage | undefined> {
		const messages = await browser.execute((viewType) => {
			const leaf = (window as unknown as ChatWindow).app.workspace.getLeavesOfType(viewType)[0];
			return leaf.view.state.messages.map(({ role, content, model, tokenUsage }) => ({ role, content, model, tokenUsage }));
		}, PLUGIN_VIEW_TYPE);
		return messages.filter(message => message.role === 'assistant').pop();
	}

	async saveLastReply(noteName: string): Promise<void> {
		await this.clickLastReplyAction('Save');
		await this.submitNoteName(noteName);
	}

	async insertLastReplyIntoNewNote(noteName: string): Promise<void> {
		await this.clickLastReplyAction('Insert to notes');
		const createNew = $('button=Create new note');
		await createNew.waitForClickable({ timeout: 5_000 });
		await createNew.click();
		await this.submitNoteName(noteName);
	}

	async readNote(path: string): Promise<string> {
		let content = '';
		await browser.waitUntil(async () => {
			content = await browser.execute(async (notePath) => {
				const adapter = (window as unknown as { app: { vault: { adapter: { exists(p: string): Promise<boolean>; read(p: string): Promise<string> } } } }).app.vault.adapter;
				return (await adapter.exists(notePath)) ? adapter.read(notePath) : '';
			}, path);
			return content !== '';
		}, { timeout: 10_000, timeoutMsg: `${path} was not created` });
		return content;
	}

	async proposalCards(): Promise<Array<{ text: string; button: string }>> {
		return browser.execute(() => Array.from(activeDocument.querySelectorAll('.ia-write-proposal-card')).map(card => ({
			text: (card.querySelector('.ia-write-proposal-card__note')?.textContent ?? '').trim(),
			button: (card.querySelector('.ia-write-proposal-card__actions button')?.textContent ?? '').trim(),
		})));
	}

	async waitForProposalCard(timeoutMs = 10_000): Promise<void> {
		await $('.ia-write-proposal-card').waitForDisplayed({ timeout: timeoutMs });
	}

	async applyFirstProposal(): Promise<void> {
		const apply = $('.ia-write-proposal-card__actions button');
		await apply.waitForClickable({ timeout: 10_000 });
		await apply.click();
		const confirm = $('[data-testid="ia-confirm-modal-confirm-btn"]');
		await confirm.waitForClickable({ timeout: 10_000 });
		await confirm.click();
		await browser.waitUntil(async () => (await this.proposalCards())[0]?.button === 'Applied', { timeout: 10_000, timeoutMsg: 'Proposal was not applied' });
	}

	private async clickLastReplyAction(label: string): Promise<void> {
		await browser.execute((text) => {
			const replies = Array.from(activeDocument.querySelectorAll('.ia-chat-message--assistant'));
			const button = Array.from(replies[replies.length - 1]?.querySelectorAll<HTMLButtonElement>('.msg-action-btn') ?? [])
				.find(candidate => candidate.textContent === text);
			if (!button) throw new Error(`No "${text}" action on the last reply`);
			button.click();
		}, label);
	}

	private async submitNoteName(name: string): Promise<void> {
		const input = $('.modal-container input[type="text"]');
		await input.waitForDisplayed({ timeout: 5_000 });
		await input.setValue(name);
		await browser.keys('Enter');
	}
}
