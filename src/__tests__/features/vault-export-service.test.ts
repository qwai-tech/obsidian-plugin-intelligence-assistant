import { TFile } from 'obsidian';
import { VaultExportService, type ExportTargetPicker, type NoteChoice } from '@/features/chat/vault-export-service';
import type { Message } from '@/features/conversations/types/conversation';

jest.mock('@/i18n', () => ({ t: (key: string, args?: Record<string, unknown>) => args ? `${key}:${JSON.stringify(args)}` : key }));

const assistantMessage = (overrides: Partial<Message> = {}): Message => ({ role: 'assistant', content: 'Hello world', model: 'gpt-4o', ...overrides });

const makeApp = () => ({
	vault: {
		create: jest.fn(async () => undefined),
		process: jest.fn(async (_file: TFile, fn: (data: string) => string) => fn('existing')),
		getAbstractFileByPath: jest.fn(() => null),
	},
	workspace: {
		getLeaf: jest.fn(() => ({ openFile: jest.fn(async () => undefined) })),
		getLeavesOfType: jest.fn(() => []),
	},
});

const picker = (noteName: string | null, note: NoteChoice): ExportTargetPicker => ({
	askNoteName: jest.fn(async () => noteName),
	pickNote: jest.fn(async () => note),
});

describe('VaultExportService', () => {
	it('creates a note named by the user', async () => {
		const app = makeApp();
		const service = new VaultExportService(app as never, picker('My Note', null));

		await service.saveToNewNote(assistantMessage());

		const [fileName, content] = app.vault.create.mock.calls[0] as unknown as [string, string];
		expect(fileName).toBe('My Note.md');
		expect(content).toContain('Hello world');
	});

	it('creates nothing when the user cancels the name prompt', async () => {
		const app = makeApp();
		const service = new VaultExportService(app as never, picker(null, null));

		await service.saveToNewNote(assistantMessage());

		expect(app.vault.create).not.toHaveBeenCalled();
	});

	it('appends the message to the note the user picks', async () => {
		const app = makeApp();
		const note = Object.assign(new TFile(), { path: 'Notes/a.md' });
		const service = new VaultExportService(app as never, picker(null, note));

		await service.insertIntoNote(assistantMessage());

		const [file] = app.vault.process.mock.calls[0] as unknown as [TFile];
		const content = await app.vault.process.mock.results[0].value as string;
		expect(file).toBe(note);
		expect(content.startsWith('existing')).toBe(true);
		expect(content).toContain('Hello world');
	});

	it('creates a new note when the user asks for one instead of picking', async () => {
		const app = makeApp();
		const service = new VaultExportService(app as never, picker('Fallback', 'new'));

		await service.insertIntoNote(assistantMessage());

		expect(app.vault.process).not.toHaveBeenCalled();
		expect((app.vault.create.mock.calls[0] as unknown as [string])[0]).toBe('Fallback.md');
	});

	it('does nothing when the user dismisses the note picker', async () => {
		const app = makeApp();
		const names = picker('Unused', null);
		const service = new VaultExportService(app as never, names);

		await service.insertIntoNote(assistantMessage());

		expect(app.vault.process).not.toHaveBeenCalled();
		expect(names.askNoteName).not.toHaveBeenCalled();
	});
});
