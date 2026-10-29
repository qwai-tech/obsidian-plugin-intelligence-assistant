import type { App } from 'obsidian';
import type { ExportTargetPicker, NoteChoice } from '@/application/services/vault-export-service';
import { TextInputModal } from './text-input-modal';
import { SingleFileSelectionModal } from './single-file-selection-modal';

export class ModalExportTargetPicker implements ExportTargetPicker {
	constructor(private readonly app: App) {}

	askNoteName(defaultName: string): Promise<string | null> {
		return new Promise((resolve) => {
			new TextInputModal(this.app, 'Create New Note', 'Enter note name', defaultName, resolve).open();
		});
	}

	pickNote(): Promise<NoteChoice> {
		return new Promise((resolve) => {
			new SingleFileSelectionModal(this.app, resolve).open();
		});
	}
}
