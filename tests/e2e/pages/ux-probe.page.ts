import * as fs from 'node:fs';
import * as path from 'node:path';
import { BasePage } from './base.page';
import { TestIds } from '../support/testids';

const EVIDENCE = path.resolve('test-results/ux-fixes-2026-11-03/screens');

export class UxProbePage extends BasePage {
	async capture(name: string): Promise<void> {
		fs.mkdirSync(EVIDENCE, { recursive: true });
		await browser.saveScreenshot(path.join(EVIDENCE, `${name}.png`));
	}

	async clearNotices(): Promise<void> {
		await browser.execute(() => activeDocument.querySelectorAll('.notice').forEach(notice => notice.remove()));
	}

	async noticeTexts(): Promise<string[]> {
		return browser.execute(() => Array.from(activeDocument.querySelectorAll('.notice')).map(notice => (notice.textContent ?? '').trim()));
	}

	async waitForNotice(matches: (text: string) => boolean, timeoutMs = 10_000): Promise<string> {
		let found = '';
		await browser.waitUntil(async () => {
			found = (await this.noticeTexts()).find(matches) ?? '';
			return found !== '';
		}, { timeout: timeoutMs, timeoutMsg: `No matching notice; saw: ${JSON.stringify(await this.noticeTexts())}` });
		return found;
	}

	async confirmDialogText(timeoutMs = 3_000): Promise<string | null> {
		const confirm = this.$testid(TestIds.settings.confirmModalConfirmBtn);
		const opened = await confirm.waitForDisplayed({ timeout: timeoutMs }).then(() => true, () => false);
		if (!opened) return null;
		return browser.execute(() => (activeDocument.querySelector('.modal-container:last-of-type .modal-content')?.textContent ?? '').trim());
	}

	async answerConfirm(confirm: boolean): Promise<void> {
		await this.click(confirm ? TestIds.settings.confirmModalConfirmBtn : TestIds.settings.confirmModalCancelBtn);
	}

	async clickButton(text: string, scope = 'body'): Promise<void> {
		await browser.waitUntil(async () => browser.execute((label, root) => {
			const button = Array.from(activeDocument.querySelectorAll<HTMLButtonElement>(`${root} button`))
				.find(candidate => (candidate.textContent ?? '').trim() === label && candidate.offsetParent !== null);
			if (!button) return false;
			button.click();
			return true;
		}, text, scope), { timeout: 10_000, timeoutMsg: `Button not found: ${text} in ${scope}` });
	}

	async settingNamesIn(scope: string): Promise<string[]> {
		return browser.execute((root) => Array.from(activeDocument.querySelectorAll(`${root} .setting-item-name`)).map(name => (name.textContent ?? '').trim()), scope);
	}

	async settingDescription(name: string): Promise<string> {
		return browser.execute((label) => {
			const item = Array.from(activeDocument.querySelectorAll('.setting-item'))
				.find(candidate => (candidate.querySelector('.setting-item-name')?.textContent ?? '').trim() === label);
			return (item?.querySelector('.setting-item-description')?.textContent ?? '').trim();
		}, name);
	}

	async textIn(scope: string): Promise<string> {
		return browser.execute((root) => (activeDocument.querySelector(root)?.textContent ?? '').trim(), scope);
	}

	async widthRatio(childSelector: string, parentSelector: string): Promise<number> {
		return browser.execute((child, parent) => {
			const childEl = activeDocument.querySelector(child);
			const parentEl = activeDocument.querySelector(parent);
			if (!(childEl instanceof HTMLElement) || !(parentEl instanceof HTMLElement)) throw new Error(`Not found: ${child} / ${parent}`);
			return childEl.getBoundingClientRect().width / parentEl.getBoundingClientRect().width;
		}, childSelector, parentSelector);
	}

	async overflowingChildren(selector: string): Promise<string[]> {
		return browser.execute((target) => {
			const container = activeDocument.querySelector(target);
			if (!(container instanceof HTMLElement)) throw new Error(`Not found: ${target}`);
			const box = container.getBoundingClientRect();
			return Array.from(container.querySelectorAll<HTMLElement>('*'))
				.filter(child => child.offsetParent !== null && child.getClientRects().length > 0)
				.filter(child => {
					const rect = child.getBoundingClientRect();
					return rect.width > 0 && (rect.right > box.right + 1 || rect.left < box.left - 1);
				})
				.map(child => `${child.tagName.toLowerCase()}.${child.className}`);
		}, selector);
	}
}
