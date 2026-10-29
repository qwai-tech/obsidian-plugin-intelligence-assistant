import { App, Notice, TFile } from 'obsidian';
import { t } from '@/i18n';
import type { Message } from '@/types';
import { errorMessage } from '@/utils/errors';

export type NoteChoice = TFile | 'new' | null;

export interface ExportTargetPicker {
	askNoteName(defaultName: string): Promise<string | null>;
	pickNote(): Promise<NoteChoice>;
}

export class VaultExportService {
	constructor(private readonly app: App, private readonly picker: ExportTargetPicker) {}

	async saveToNewNote(message: Message): Promise<void> {
		const noteName = await this.picker.askNoteName(`Chat Message ${new Date().toLocaleDateString()}`);
		await this.doSaveToNewNote(noteName, message);
	}

	async insertIntoNote(message: Message): Promise<void> {
		const choice = await this.picker.pickNote();
		if (choice === 'new') {
			await this.saveToNewNote(message);
		} else if (choice) {
			await this.doInsertIntoNote(choice, message);
		}
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
			const errMsg = errorMessage(_error);
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
			const errMsg = errorMessage(_error);
			console.error('Error inserting to note:', errMsg);
			new Notice(t('chat.notices.messageInsertFailed', { message: errMsg }));
		}
	}
}
