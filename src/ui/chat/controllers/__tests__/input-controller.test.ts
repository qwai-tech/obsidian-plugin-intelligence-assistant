import { Menu, Notice, TFile, TFolder, type App } from 'obsidian';
import { InputController } from '../input-controller';
import { ChatViewState } from '@/ui/state/chat-view-state';
import type { PluginHost } from '@/ui/plugin-host';
import { initI18n, t } from '@/i18n';

interface FakeVault {
	read: jest.Mock<Promise<string>, [TFile]>;
	readBinary: jest.Mock<Promise<ArrayBuffer>, [TFile]>;
	getMarkdownFiles: jest.Mock<TFile[], []>;
	getFiles: jest.Mock<TFile[], []>;
}

interface FakeMenuItem {
	setTitle: jest.Mock;
	setIcon: jest.Mock;
	onClick: jest.Mock;
}

interface FakeMenu {
	items: FakeMenuItem[];
	showAtMouseEvent: jest.Mock;
}

interface Harness {
	controller: InputController;
	state: ChatViewState;
	vault: FakeVault;
	textarea: HTMLTextAreaElement;
	preview: HTMLElement;
	sent: string[];
}

function makeFile(path: string): TFile {
	const name = path.split('/').pop() ?? path;
	const dot = name.lastIndexOf('.');
	return Object.assign(new TFile(), {
		path,
		name,
		basename: dot > 0 ? name.slice(0, dot) : name,
		extension: dot > 0 ? name.slice(dot + 1) : '',
	});
}

function makeFolder(path: string): TFolder {
	return Object.assign(new TFolder(), { path, name: path });
}

function makeHarness(): Harness {
	const state = new ChatViewState();
	const vault: FakeVault = {
		read: jest.fn(async (file: TFile) => `contents of ${file.path}`),
		readBinary: jest.fn(async (_file: TFile) => new Uint8Array([1, 2, 3]).buffer),
		getMarkdownFiles: jest.fn((): TFile[] => []),
		getFiles: jest.fn((): TFile[] => []),
	};
	const app = { vault } as unknown as App;
	const controller = new InputController(app, {} as PluginHost, state);
	const textarea = document.body.appendChild(document.createElement('textarea'));
	const preview = document.body.appendChild(document.createElement('div'));
	controller.setInputElement(textarea);
	controller.setAttachmentPreviewElement(preview);
	const sent: string[] = [];
	state.on('send-message', (payload: { content: string }) => {
		sent.push(payload.content);
	});
	return { controller, state, vault, textarea, preview, sent };
}

function pressKey(textarea: HTMLTextAreaElement, init: KeyboardEventInit): KeyboardEvent {
	const event = new KeyboardEvent('keydown', { cancelable: true, ...init });
	textarea.dispatchEvent(event);
	return event;
}

function lastMenu(): FakeMenu {
	const results = jest.mocked(Menu).mock.results;
	return results[results.length - 1].value as unknown as FakeMenu;
}

function clickMenuItem(item: FakeMenuItem): void {
	const handler = item.onClick.mock.calls[0][0] as () => void;
	handler();
}

function previewNames(preview: HTMLElement): string[] {
	return Array.from(preview.querySelectorAll('.ia-attachment-filename')).map(el => el.textContent ?? '');
}

async function flushPromises(): Promise<void> {
	await new Promise(resolve => setTimeout(resolve, 0));
}

describe('InputController', () => {
	beforeAll(() => {
		initI18n('en');
	});

	beforeEach(() => {
		jest.clearAllMocks();
		document.body.innerHTML = '';
	});

	describe('sending from the keyboard', () => {
		it('sends the typed message on Enter and clears the input', async () => {
			const { controller, textarea, sent } = makeHarness();
			await controller.initialize();
			controller.setInputValue('Summarise my notes');

			const event = pressKey(textarea, { key: 'Enter' });

			expect(sent).toEqual(['Summarise my notes']);
			expect(event.defaultPrevented).toBe(true);
			expect(textarea.value).toBe('');
		});

		it('keeps the text for a new line on Shift+Enter', () => {
			const { controller, textarea, sent } = makeHarness();
			controller.setInputValue('First line');

			const event = pressKey(textarea, { key: 'Enter', shiftKey: true });

			expect(sent).toEqual([]);
			expect(event.defaultPrevented).toBe(false);
			expect(textarea.value).toBe('First line');
		});

		it('does not send a blank message', () => {
			const { controller, textarea, sent } = makeHarness();
			controller.setInputValue('   \n ');

			const event = pressKey(textarea, { key: 'Enter' });

			expect(sent).toEqual([]);
			expect(event.defaultPrevented).toBe(true);
			expect(textarea.value).toBe('   \n ');
		});

		it('ignores keys other than Enter', () => {
			const { controller, textarea, sent } = makeHarness();
			controller.setInputValue('Draft');

			pressKey(textarea, { key: 'a' });

			expect(sent).toEqual([]);
			expect(textarea.value).toBe('Draft');
		});

		it.failing('does not send while an input method composition is still in progress', () => {
			const { controller, textarea, sent } = makeHarness();
			controller.setInputValue('ni hao');

			pressKey(textarea, { key: 'Enter', isComposing: true });

			expect(sent).toEqual([]);
			expect(textarea.value).toBe('ni hao');
		});
	});

	describe('input box', () => {
		it('marks the textarea as auto-resizing', () => {
			const { textarea } = makeHarness();

			expect(textarea.classList.contains('ia-autoresize-textarea')).toBe(true);
		});

		it('grows with its content while typing', () => {
			const { textarea } = makeHarness();
			Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 120 });

			textarea.dispatchEvent(new Event('input'));

			expect(textarea.style.getPropertyValue('--ia-textarea-height')).toBe('120px');
		});

		it('stops growing at 200 pixels', () => {
			const { controller, textarea } = makeHarness();
			Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 640 });

			controller.setInputValue('a very long draft');

			expect(textarea.style.getPropertyValue('--ia-textarea-height')).toBe('200px');
		});

		it('reads, replaces and clears the typed text', () => {
			const { controller, textarea } = makeHarness();

			controller.setInputValue('hello');
			const typed = controller.getInputValue();
			controller.clearInput();

			expect(typed).toBe('hello');
			expect(controller.getInputValue()).toBe('');
			expect(textarea.value).toBe('');
		});

		it('focuses the textarea', () => {
			const { controller, textarea } = makeHarness();

			controller.focusInput();

			expect(document.activeElement).toBe(textarea);
		});

		it('reads as empty and ignores writes before an input box is attached', () => {
			const controller = new InputController({} as App, {} as PluginHost, new ChatViewState());

			controller.setInputValue('lost');
			controller.focusInput();

			expect(controller.getInputValue()).toBe('');
		});

		it('detaches from the input box on cleanup', () => {
			const { controller, textarea } = makeHarness();
			controller.setInputValue('draft');

			controller.cleanup();
			controller.setInputValue('after cleanup');

			expect(controller.getInputValue()).toBe('');
			expect(textarea.value).toBe('draft');
		});
	});

	describe('attachments', () => {
		it('attaches a note with its contents and lists it in the preview', async () => {
			const { controller, state, preview } = makeHarness();
			const note = makeFile('notes/plan.md');

			await controller.attachFile(note);

			expect(state.currentAttachments).toEqual([
				{ type: 'file', name: 'plan.md', path: 'notes/plan.md', content: 'contents of notes/plan.md' },
			]);
			expect(preview.classList.contains('ia-hidden')).toBe(false);
			expect(previewNames(preview)).toEqual(['plan.md']);
			expect(preview.querySelector('.ia-attachment-item span')?.textContent).toBe('📎');
			expect(Notice).toHaveBeenCalledWith(t('chat.notices.attached', { name: 'plan.md' }));
		});

		it('attaches an image as a base64 data URL', async () => {
			const { controller, state, preview } = makeHarness();

			await controller.attachImage(makeFile('assets/diagram.png'));

			expect(state.currentAttachments).toEqual([
				{ type: 'image', name: 'diagram.png', path: 'assets/diagram.png', content: 'data:image/png;base64,AQID' },
			]);
			expect(preview.querySelector('.ia-attachment-item span')?.textContent).toBe('🖼️');
			expect(Notice).toHaveBeenCalledWith(t('chat.notices.attached', { name: 'diagram.png' }));
		});

		it.failing('labels a .jpg image with the standard image/jpeg media type', async () => {
			const { controller, state } = makeHarness();

			await controller.attachImage(makeFile('photos/holiday.jpg'));

			expect(state.currentAttachments[0].content).toBe('data:image/jpeg;base64,AQID');
		});

		it('removes an attachment when its remove button is clicked', async () => {
			const { controller, state, preview } = makeHarness();
			await controller.attachFile(makeFile('a.md'));
			await controller.attachFile(makeFile('b.md'));
			await controller.attachFile(makeFile('c.md'));

			preview.querySelectorAll<HTMLButtonElement>('.ia-attachment-remove-inline')[1].click();

			expect(state.currentAttachments.map(attachment => attachment.name)).toEqual(['a.md', 'c.md']);
			expect(previewNames(preview)).toEqual(['a.md', 'c.md']);
		});

		it('hides the preview once the last attachment is removed', async () => {
			const { controller, state, preview } = makeHarness();
			await controller.attachFile(makeFile('a.md'));

			controller.removeAttachment(0);

			expect(state.currentAttachments).toEqual([]);
			expect(preview.classList.contains('ia-hidden')).toBe(true);
			expect(preview.children).toHaveLength(0);
		});

		it('clears every attachment at once', async () => {
			const { controller, state, preview } = makeHarness();
			await controller.attachFile(makeFile('a.md'));
			await controller.attachImage(makeFile('b.png'));

			controller.clearAttachments();

			expect(state.currentAttachments).toEqual([]);
			expect(preview.classList.contains('ia-hidden')).toBe(true);
		});

		it('still records attachments when no preview is shown', async () => {
			const { controller, state, preview } = makeHarness();
			controller.cleanup();

			await controller.attachFile(makeFile('a.md'));

			expect(state.currentAttachments).toHaveLength(1);
			expect(preview.children).toHaveLength(0);
		});
	});

	describe('references', () => {
		it('references files and folders and confirms each one', () => {
			const { controller, state } = makeHarness();
			const note = makeFile('notes/plan.md');
			const folder = makeFolder('projects');

			controller.addReference(note);
			controller.addReference(folder);

			expect(state.referencedFiles).toEqual([note, folder]);
			expect(Notice).toHaveBeenCalledWith(t('chat.notices.referenced', { name: 'plan.md' }));
			expect(Notice).toHaveBeenCalledWith(t('chat.notices.referenced', { name: 'projects' }));
		});

		it('removes a single reference', () => {
			const { controller, state } = makeHarness();
			const first = makeFile('a.md');
			const second = makeFile('b.md');
			controller.addReference(first);
			controller.addReference(second);

			controller.removeReference(0);

			expect(state.referencedFiles).toEqual([second]);
		});

		it('clears every reference at once', () => {
			const { controller, state } = makeHarness();
			controller.addReference(makeFile('a.md'));
			controller.addReference(makeFolder('projects'));

			controller.clearReferences();

			expect(state.referencedFiles).toEqual([]);
		});
	});

	describe('file and image pickers', () => {
		it('offers the first 20 notes at the mouse position', () => {
			const { controller, vault } = makeHarness();
			const notes = Array.from({ length: 25 }, (_, index) => makeFile(`note-${index}.md`));
			vault.getMarkdownFiles.mockReturnValue(notes);
			const click = new MouseEvent('click');

			controller.showFilePickerMenu(click);

			const menu = lastMenu();
			expect(menu.items).toHaveLength(20);
			expect(menu.items[0].setTitle).toHaveBeenCalledWith('note-0.md');
			expect(menu.items[19].setTitle).toHaveBeenCalledWith('note-19.md');
			expect(menu.showAtMouseEvent).toHaveBeenCalledWith(click);
		});

		it('attaches the note picked from the menu', async () => {
			const { controller, state, vault } = makeHarness();
			vault.getMarkdownFiles.mockReturnValue([makeFile('a.md'), makeFile('b.md')]);
			controller.showFilePickerMenu(new MouseEvent('click'));

			clickMenuItem(lastMenu().items[1]);
			await flushPromises();

			expect(state.currentAttachments.map(attachment => attachment.path)).toEqual(['b.md']);
		});

		it('offers only image files, whatever the case of their extension', () => {
			const { controller, vault } = makeHarness();
			vault.getFiles.mockReturnValue([
				makeFile('photo.JPG'),
				makeFile('notes.md'),
				makeFile('diagram.svg'),
				makeFile('report.pdf'),
				makeFile('anim.webp'),
			]);

			controller.showImagePickerMenu(new MouseEvent('click'));

			const titles = lastMenu().items.map(item => item.setTitle.mock.calls[0][0]);
			expect(titles).toEqual(['photo.JPG', 'diagram.svg', 'anim.webp']);
		});

		it('attaches the image picked from the menu', async () => {
			const { controller, state, vault } = makeHarness();
			vault.getFiles.mockReturnValue([makeFile('img/cat.gif')]);
			controller.showImagePickerMenu(new MouseEvent('click'));

			clickMenuItem(lastMenu().items[0]);
			await flushPromises();

			expect(state.currentAttachments).toEqual([
				{ type: 'image', name: 'cat.gif', path: 'img/cat.gif', content: 'data:image/gif;base64,AQID' },
			]);
		});
	});
});
