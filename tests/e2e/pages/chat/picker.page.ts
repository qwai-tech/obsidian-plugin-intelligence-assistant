import { BasePage } from '../base.page';

const MODAL = '.searchable-reference-modal';

export interface PickerRowState {
	background: string;
	marked: boolean;
}

export class PickerPage extends BasePage {
	async openReferencePicker(): Promise<void> {
		const button = $('.chat-input-toolbar-btn.is-link');
		await button.waitForClickable({ timeout: 10_000 });
		await button.click();
		await $(`${MODAL} [role="option"]`).waitForDisplayed({ timeout: 10_000 });
	}

	async clickRow(index: number): Promise<void> {
		const rows = await $$(`${MODAL} [role="option"]`).getElements();
		await rows[index].click();
	}

	async rowStates(): Promise<PickerRowState[]> {
		return browser.execute((modal) => Array.from(activeDocument.querySelectorAll<HTMLElement>(`${modal} [role="option"]`)).map(row => {
			const mark = row.querySelector<HTMLElement>('.ia-modal-list-check');
			return {
				background: getComputedStyle(row).backgroundColor,
				marked: Boolean(mark && mark.offsetParent !== null && getComputedStyle(mark).visibility !== 'hidden' && mark.childElementCount > 0),
			};
		}), MODAL);
	}

	async addButtonText(): Promise<string> {
		return browser.execute((modal) => (activeDocument.querySelector(`${modal} button.mod-cta`)?.textContent ?? '').trim(), MODAL);
	}

	async addSelected(): Promise<void> {
		const add = $(`${MODAL} button.mod-cta`);
		await add.click();
		await add.waitForExist({ reverse: true, timeout: 5_000 });
	}

	async attachedReferencePaths(): Promise<string[]> {
		return browser.execute(() => Array.from(activeDocument.querySelectorAll('.input-reference-area .reference-path')).map(path => (path.textContent ?? '').trim()));
	}
}
