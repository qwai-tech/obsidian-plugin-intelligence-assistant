import { Notice } from 'obsidian';
import { t } from '@/i18n';
import type { Message } from '@/features/conversations';

export function renderCopyButton(actions: HTMLElement, contentEl: HTMLElement | null) {
	const copyGroup = actions.createDiv('ia-chat-message__copy-group');
	copyGroup.addClass('ia-chat-copy-group');

	const copyAllBtn = copyGroup.createEl('button', { text: t('chat.message.copy') });
	copyAllBtn.classList.add('ia-chat-copy-btn');
	copyAllBtn.title = 'Copy entire message';
	copyAllBtn.disabled = !contentEl;
	copyAllBtn.addEventListener('click', () => {
		void (async () => {
			if (!contentEl) return;
			try {
				await copyMessageContent(contentEl);
				new Notice(t('chat.message.copied'));
			} catch (error) {
				console.error('Copy failed:', error);
				new Notice(t('chat.message.copyFailed'));
			}
		})();
	});
}

async function copyMessageContent(contentEl: HTMLElement) {
	const text = contentEl.innerText.trim();
	if (!text) {
		throw new Error('Message is empty');
	}
	await writeTextToClipboard(text);
}

async function writeTextToClipboard(text: string) {
	// Use the modern Clipboard API
	if (navigator?.clipboard?.writeText) {
		await navigator.clipboard.writeText(text);
		return;
	}

	// If Clipboard API is not available, throw an error
	// Modern browsers all support the Clipboard API
	throw new Error('Clipboard API not available');
}

export function appendTokenUsageToMessage(messageEl: HTMLElement, usage: Message['tokenUsage']) {
	const body = messageEl.querySelector<HTMLElement>('.ia-chat-message__body');
	if (!body) return;
	const existing = body.querySelector('.ia-chat-message__footer');
	if (existing) existing.remove();
	renderTokenUsageFooter(body, usage);
}

export function renderTokenUsageFooter(container: HTMLElement, usage?: Message['tokenUsage']) {
	if (!usage) return;
	const summary: string[] = [];
	if (usage.promptTokens !== undefined) summary.push(`${t('chat.message.tokenUsagePrompt')}: ${usage.promptTokens}`);
	if (usage.completionTokens !== undefined) summary.push(`${t('chat.message.tokenUsageCompletion')}: ${usage.completionTokens}`);
	if (usage.totalTokens !== undefined) summary.push(`${t('chat.message.tokenUsageTotal')}: ${usage.totalTokens}`);
	if (summary.length === 0) return;

	const footer = container.createDiv('ia-chat-message__footer');
	footer.addClass('ia-chat-message__annotation');
	footer.setAttr('data-exclude-from-copy', 'true');
	footer.setText(`${t('chat.message.tokenUsage')} · ${summary.join(' · ')}`);
}
