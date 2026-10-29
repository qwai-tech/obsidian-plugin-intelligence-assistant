import { Notice, type App, type TFile, type TFolder } from 'obsidian';
import { t } from '@/i18n/index';
import type { ChatViewState } from '@/ui/state/chat-view-state';
import { SearchableReferenceModal } from '@/ui/modals/searchable-reference-modal';
import { SearchableImageModal } from '@/ui/modals/searchable-image-modal';

export function pickReferences(app: App, state: ChatViewState, onChange: () => void): void {
	new SearchableReferenceModal(app, (selected: Array<TFile | TFolder>) => {
		addReferences(state, selected);
		onChange();
		if (selected.length > 0) {
			new Notice(t('chat.notices.referencesAdded', { count: selected.length }));
		}
	}).open();
}

export function addReferences(state: ChatViewState, references: Array<TFile | TFolder>): void {
	for (const reference of references) {
		if (!state.referencedFiles.some(item => item.path === reference.path)) {
			state.addReferencedFile(reference);
		}
	}
}

export function pickImages(app: App, state: ChatViewState, onChange: () => void): void {
	new SearchableImageModal(app, (selected: TFile[]) => {
		void (async () => {
			for (const file of selected) {
				const base64 = toBase64(await app.vault.readBinary(file));
				state.currentAttachments.push({ type: 'image', name: file.name, path: file.path, content: `data:image/${file.extension};base64,${base64}` });
			}
			onChange();
			if (selected.length > 0) {
				new Notice(t('chat.notices.attachedImages', { count: selected.length }));
			}
		})();
	}).open();
}

function toBase64(buffer: ArrayBuffer): string {
	let binary = '';
	for (const byte of new Uint8Array(buffer)) {
		binary += String.fromCharCode(byte);
	}
	return window.btoa(binary);
}
