// src/__tests__/application/vault-export-service.test.ts
import { VaultExportService } from '../../application/services/vault-export-service';
import type { Message } from '../../types';

jest.mock('obsidian', () => ({
	Notice: jest.fn(),
	TFile: class TFile {},
}));

jest.mock('../../i18n', () => ({ t: (key: string, args?: Record<string,unknown>) => args ? `${key}:${JSON.stringify(args)}` : key }));

jest.mock('../../presentation/components/modals/text-input-modal', () => ({
	TextInputModal: jest.fn().mockImplementation((_app: unknown, _title: unknown, _placeholder: unknown, _default: unknown, cb: (v: string) => void) => ({
		open: () => cb('My Note'),
	})),
}));

jest.mock('../../presentation/components/modals/single-file-selection-modal', () => ({
	SingleFileSelectionModal: jest.fn().mockImplementation((_app: unknown, cb: (f: unknown) => void) => ({
		open: () => cb(null),
	})),
}));

function makeAssistantMessage(overrides: Partial<Message> = {}): Message {
	return { role: 'assistant', content: 'Hello world', model: 'gpt-4o', ...overrides };
}

describe('VaultExportService', () => {
	describe('saveToNewNote', () => {
		it('creates a vault file when user provides a note name', async () => {
			const createFn = jest.fn().mockResolvedValue(undefined);
			const getAbstractFileByPath = jest.fn().mockReturnValue(null);
			const app = {
				vault: { create: createFn, getAbstractFileByPath },
				workspace: { getLeaf: jest.fn().mockReturnValue({ openFile: jest.fn() }) },
			} as any;
			const svc = new VaultExportService(app);
			svc.saveToNewNote(makeAssistantMessage());
			// modal callback fires synchronously via mock
			await new Promise(r => setTimeout(r, 0)); // flush promises
			expect(createFn).toHaveBeenCalledTimes(1);
			const [fileName, content] = createFn.mock.calls[0];
			expect(fileName).toContain('My Note');
			expect(content).toContain('Hello world');
		});
	});

	describe('insertIntoNote', () => {
		it('falls back to saveToNewNote when no file is selected (null)', () => {
			const app = {
				vault: { create: jest.fn().mockResolvedValue(undefined), getAbstractFileByPath: jest.fn().mockReturnValue(null) },
				workspace: { getLeaf: jest.fn().mockReturnValue({ openFile: jest.fn() }) },
			} as any;
			const svc = new VaultExportService(app);
			const saveToNewNoteSpy = jest.spyOn(svc, 'saveToNewNote');
			svc.insertIntoNote(makeAssistantMessage());
			expect(saveToNewNoteSpy).toHaveBeenCalledWith(makeAssistantMessage());
		});
	});
});
