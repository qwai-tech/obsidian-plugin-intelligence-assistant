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

	async isVisible(selector: string): Promise<boolean> {
		return browser.execute((target) => {
			const el = activeDocument.querySelector(target);
			return el instanceof HTMLElement && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden';
		}, selector);
	}

	async overlaps(first: string, second: string): Promise<boolean> {
		return browser.execute((a, b) => {
			const ra = activeDocument.querySelector(a)?.getBoundingClientRect();
			const rb = activeDocument.querySelector(b)?.getBoundingClientRect();
			if (!ra || !rb) throw new Error(`Not found: ${a} / ${b}`);
			return ra.left < rb.right && rb.left < ra.right && ra.top < rb.bottom && rb.top < ra.bottom;
		}, first, second);
	}

	async computedStyles(selectors: string[], properties: string[]): Promise<Array<Record<string, string>>> {
		return browser.execute((targets, props) => targets.map(target => {
			const el = activeDocument.querySelector(target);
			if (!el) throw new Error(`Not found: ${target}`);
			const style = getComputedStyle(el);
			return Object.fromEntries(props.map(prop => [prop, style.getPropertyValue(prop)]));
		}), selectors, properties);
	}

	async createNotes(prefix: string, count: number): Promise<void> {
		await browser.execute(async (name, total) => {
			const vault = (window as unknown as { app: { vault: { create(path: string, data: string): Promise<unknown>; getAbstractFileByPath(path: string): unknown } } }).app.vault;
			for (let index = 0; index < total; index++) {
				const path = `${name}-${index}.md`;
				if (!vault.getAbstractFileByPath(path)) await vault.create(path, `# Note ${index}\n\nThis note is about topic ${index} for the indexing check.`);
			}
		}, prefix, count);
	}

	watchNoticeCount(): { stop(): Promise<number> } {
		void browser.execute(() => {
			const scope = window as unknown as { __iaNoticeMax?: number; __iaNoticeTimer?: number };
			scope.__iaNoticeMax = 0;
			scope.__iaNoticeTimer = window.setInterval(() => {
				scope.__iaNoticeMax = Math.max(scope.__iaNoticeMax ?? 0, activeDocument.querySelectorAll('.notice').length);
			}, 100);
		});
		return {
			stop: () => browser.execute(() => {
				const scope = window as unknown as { __iaNoticeMax?: number; __iaNoticeTimer?: number };
				window.clearInterval(scope.__iaNoticeTimer);
				return scope.__iaNoticeMax ?? 0;
			}),
		};
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
