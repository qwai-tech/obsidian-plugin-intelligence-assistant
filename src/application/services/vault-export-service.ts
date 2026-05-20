// src/application/services/vault-export-service.ts
import { App, Notice, TFile } from 'obsidian';
import { t } from '@/i18n';
import { TextInputModal } from '@/presentation/components/modals/text-input-modal';
import { SingleFileSelectionModal } from '@/presentation/components/modals/single-file-selection-modal';
import type { Message } from '@/types';

export class VaultExportService {
	constructor(private readonly app: App) {}

	saveToNewNote(message: Message): void {
		const defaultName = `Chat Message ${new Date().toLocaleDateString()}`;
		new TextInputModal(
			this.app,
			'Create New Note',
			'Enter note name',
			defaultName,
			(noteName) => {
				void this.doSaveToNewNote(noteName, message);
			}
		).open();
	}

	insertIntoNote(message: Message): void {
		new SingleFileSelectionModal(this.app, (selectedFile) => {
			if (selectedFile instanceof TFile) {
				void this.doInsertIntoNote(selectedFile, message);
			} else {
				this.saveToNewNote(message);
			}
		}).open();
	}

	private async doSaveToNewNote(noteName: string | null, message: Message): Promise<void> {
		if (!noteName || !noteName.trim()) return;
		try {
			const fileName = noteName.replace(/[\\/:*?"<>|]/g, '-') + '.md';
			let content = `# ${noteName}\n\n`;
			content += `Created from AI chat on ${new Date().toLocaleString()}\n\n---\n\n`;
			if (message.role === 'user') {
				content += `## 💬 User Message\n\n`;
			} else {
				const modelName = (message as { model?: string }).model || 'Assistant';
				content += `## 🤖 ${String(modelName)}\n\n`;
			}
			content += message.content + '\n';
			await this.app.vault.create(fileName, content);
			new Notice(t('chat.notices.noteCreated', { name: fileName }));
			const file = this.app.vault.getAbstractFileByPath(fileName);
			if (file instanceof TFile) {
				await this.app.workspace.getLeaf(false).openFile(file);
			}
		} catch (_error) {
			const errMsg = _error instanceof Error ? _error.message : String(_error);
			console.error('Error creating note:', errMsg);
			new Notice(t('chat.notices.noteCreateFailed', { message: errMsg }));
		}
	}

	private async doInsertIntoNote(selectedFile: TFile, message: Message): Promise<void> {
		try {
			let content = await this.app.vault.read(selectedFile);
			content += `\n\n---\n\n`;
			if (message.role === 'user') {
				content += `## 💬 User Message (${new Date().toLocaleString()})\n\n`;
			} else {
				const modelName = (message as { model?: string }).model || 'Assistant';
				content += `## 🤖 ${String(modelName)} (${new Date().toLocaleString()})\n\n`;
			}
			content += message.content + '\n';
			await this.app.vault.modify(selectedFile, content);
			new Notice(t('chat.notices.messageInserted', { path: selectedFile.path }));
			await this.app.workspace.getLeaf(false).openFile(selectedFile);
		} catch (_error) {
			const errMsg = _error instanceof Error ? _error.message : String(_error);
			console.error('Error inserting to note:', errMsg);
			new Notice(t('chat.notices.messageInsertFailed', { message: errMsg }));
		}
	}
}
