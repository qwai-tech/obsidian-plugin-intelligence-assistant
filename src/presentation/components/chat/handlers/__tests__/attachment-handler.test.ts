/**
 * AttachmentHandler Tests
 * Comprehensive test suite for file and image attachment handling
 */

import { AttachmentHandler } from '../attachment-handler';
import { ChatViewState } from '../../state/chat-view-state';
import { Attachment } from '@/types';
import { App, TFile, Menu, Notice } from 'obsidian';

// Mock files for testing
const mockMarkdownFile: TFile = {
	path: 'notes/test.md',
	name: 'test.md',
	basename: 'test',
	extension: 'md',
	vault: null as any,
	parent: null,
	stat: { ctime: 0, mtime: 0, size: 0 },
} as TFile;

const mockImageFile: TFile = {
	path: 'images/photo.jpg',
	name: 'photo.jpg',
	basename: 'photo',
	extension: 'jpg',
	vault: null as any,
	parent: null,
	stat: { ctime: 0, mtime: 0, size: 0 },
} as TFile;

// Mock App with vault operations
const createMockApp = (): App => {
	return {
		vault: {
			getMarkdownFiles: jest.fn(() => [mockMarkdownFile]),
			getFiles: jest.fn(() => [mockImageFile]),
			read: jest.fn(async () => 'File content here'),
			readBinary: jest.fn(async () => new ArrayBuffer(8)),
		},
		workspace: {
			getLeaf: jest.fn(() => ({
				openFile: jest.fn(),
			})),
		},
	} as unknown as App;
};

// Helper to create DOM container
function createContainer(): HTMLElement {
	return document.createElement('div');
}

describe('AttachmentHandler', () => {
	let handler: AttachmentHandler;
	let state: ChatViewState;
	let mockApp: App;
	let container: HTMLElement;

	beforeEach(() => {
		mockApp = createMockApp();
		state = new ChatViewState();
		handler = new AttachmentHandler(mockApp, state);
		container = createContainer();

		// Clear all mocks
		jest.clearAllMocks();
	});

	describe('Initialization', () => {
		it('should initialize attachment container', () => {
			handler.initializeContainer(container);

			const attachmentPreview = container.querySelector('.attachment-preview');
			expect(attachmentPreview).toBeTruthy();
			expect((attachmentPreview as HTMLElement).style.display).toBe('none');
		});

		it('should update preview when attachments change', () => {
			handler.initializeContainer(container);

			// Add an attachment to state
			state.addAttachment({
				type: 'file',
				name: 'test.md',
				path: '/test.md',
				content: 'content',
			});

			const attachmentPreview = container.querySelector('.attachment-preview') as HTMLElement;
			expect(attachmentPreview.style.display).not.toBe('none');
		});
	});

	describe('File Attachment', () => {
		it('should show notice when no files in vault', async () => {
			(mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([]);

			await handler.attachFile();

			expect(Notice).toHaveBeenCalledWith('No files found in vault');
		});

		it('should create menu with available files', async () => {
			const mockEvent = new MouseEvent('click');
			await handler.attachFile(mockEvent);

			expect(Menu).toHaveBeenCalled();
			expect(mockApp.vault.getMarkdownFiles).toHaveBeenCalled();
		});

		it('should limit file list to 20 items', async () => {
			const manyFiles = Array.from({ length: 50 }, (_, i) => ({
				...mockMarkdownFile,
				name: `file${i}.md`,
				path: `notes/file${i}.md`,
			}));
			(mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue(manyFiles);

			await handler.attachFile();

			// Menu.addItem should be called max 20 times
			const menu = (Menu as jest.Mock).mock.results[0].value;
			expect(menu.addItem).toHaveBeenCalledTimes(20);
		});

		it('should add file to state when selected', async () => {
			await handler.attachFile();

			// Simulate clicking a file in menu
			const menu = (Menu as jest.Mock).mock.results[0].value;
			const addItemCall = (menu.addItem as jest.Mock).mock.calls[0][0];
			const mockItem = {
				setTitle: jest.fn().mockReturnThis(),
				setIcon: jest.fn().mockReturnThis(),
				onClick: jest.fn().mockReturnThis(),
			};
			addItemCall(mockItem);

			// Execute the onClick callback
			const onClickCallback = (mockItem.onClick as jest.Mock).mock.calls[0][0];
			await onClickCallback();

			expect(state.currentAttachments).toHaveLength(1);
			expect(state.currentAttachments[0]).toMatchObject({
				type: 'file',
				name: 'test.md',
				path: 'notes/test.md',
				content: 'File content here',
			});
		});

		it('should show notice after attaching file', async () => {
			await handler.attachFile();

			const menu = (Menu as jest.Mock).mock.results[0].value;
			const addItemCall = (menu.addItem as jest.Mock).mock.calls[0][0];
			const mockItem = {
				setTitle: jest.fn().mockReturnThis(),
				setIcon: jest.fn().mockReturnThis(),
				onClick: jest.fn().mockReturnThis(),
			};
			addItemCall(mockItem);

			const onClickCallback = (mockItem.onClick as jest.Mock).mock.calls[0][0];
			await onClickCallback();

			expect(Notice).toHaveBeenCalledWith('Attached: test.md');
		});
	});

	describe('Image Attachment', () => {
		it('should open image picker modal', async () => {
			// This test is more integration-style since Modal is complex
			// We're mainly verifying the method doesn't throw
			await expect(handler.attachImage()).resolves.not.toThrow();
		});
	});

	describe('Preview Updates', () => {
		beforeEach(() => {
			handler.initializeContainer(container);
		});

		it('should hide preview when no attachments', () => {
			state.clearAttachments();

			const preview = container.querySelector('.attachment-preview') as HTMLElement;
			expect(preview.style.display).toBe('none');
		});

		it('should show preview when attachments exist', () => {
			state.addAttachment({
				type: 'file',
				name: 'test.md',
				path: '/test.md',
				content: 'content',
			});

			const preview = container.querySelector('.attachment-preview') as HTMLElement;
			expect(preview.style.display).toBe('flex');
		});

		it('should render file attachment preview', () => {
			state.addAttachment({
				type: 'file',
				name: 'document.pdf',
				path: '/docs/document.pdf',
				content: 'pdf content',
			});

			const preview = container.querySelector('.attachment-preview');
			expect(preview?.textContent).toContain('document.pdf');
			expect(preview?.textContent).toContain('📎');
		});

		it('should render image attachment preview', () => {
			state.addAttachment({
				type: 'image',
				name: 'photo.jpg',
				path: '/images/photo.jpg',
				content: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
			});

			const preview = container.querySelector('.attachment-preview');
			const img = preview?.querySelector('img');

			expect(img).toBeTruthy();
			expect(img?.src).toContain('data:image/jpeg');
		});

		it('should render multiple attachments', () => {
			state.addAttachment({
				type: 'file',
				name: 'file1.md',
				path: '/file1.md',
				content: 'content1',
			});
			state.addAttachment({
				type: 'file',
				name: 'file2.md',
				path: '/file2.md',
				content: 'content2',
			});

			const previewItems = container.querySelectorAll('.attachment-preview-item');
			expect(previewItems.length).toBe(2);
		});

		it('should have remove button for each attachment', () => {
			state.addAttachment({
				type: 'file',
				name: 'test.md',
				path: '/test.md',
				content: 'content',
			});

			const removeBtn = container.querySelector('.attachment-preview-item button');
			expect(removeBtn).toBeTruthy();
			expect(removeBtn?.textContent).toBe('×');
		});

		it('should remove attachment when remove button clicked', () => {
			state.addAttachment({
				type: 'file',
				name: 'test.md',
				path: '/test.md',
				content: 'content',
			});

			const removeBtn = container.querySelector('.attachment-preview-item button') as HTMLButtonElement;
			removeBtn.click();

			expect(state.currentAttachments).toHaveLength(0);
		});

		it('should remove correct attachment when multiple exist', () => {
			state.addAttachment({
				type: 'file',
				name: 'file1.md',
				path: '/file1.md',
				content: 'content1',
			});
			state.addAttachment({
				type: 'file',
				name: 'file2.md',
				path: '/file2.md',
				content: 'content2',
			});

			// Get all remove buttons
			const removeButtons = container.querySelectorAll('.attachment-preview-item button');

			// Click first remove button
			(removeButtons[0] as HTMLButtonElement).click();

			expect(state.currentAttachments).toHaveLength(1);
			expect(state.currentAttachments[0].name).toBe('file2.md');
		});
	});

	describe('Base64 Conversion', () => {
		it('should convert ArrayBuffer to base64', () => {
			// Create a simple ArrayBuffer
			const buffer = new Uint8Array([72, 101, 108, 108, 111]).buffer; // "Hello"

			// Access private method through any
			const base64 = (handler as any).arrayBufferToBase64(buffer);

			expect(base64).toBe(window.btoa('Hello'));
		});

		it('should handle empty ArrayBuffer', () => {
			const buffer = new ArrayBuffer(0);
			const base64 = (handler as any).arrayBufferToBase64(buffer);

			expect(base64).toBe('');
		});
	});

	describe('Helper Methods', () => {
		it('should clear all attachments', () => {
			state.addAttachment({
				type: 'file',
				name: 'test.md',
				path: '/test.md',
				content: 'content',
			});

			handler.clearAttachments();

			expect(state.currentAttachments).toHaveLength(0);
		});

		it('should get current attachments', () => {
			const attachment: Attachment = {
				type: 'file',
				name: 'test.md',
				path: '/test.md',
				content: 'content',
			};
			state.addAttachment(attachment);

			const attachments = handler.getAttachments();

			expect(attachments).toHaveLength(1);
			expect(attachments[0]).toEqual(attachment);
		});

		it('should return empty array when no attachments', () => {
			const attachments = handler.getAttachments();

			expect(attachments).toEqual([]);
		});
	});

	describe('Edge Cases', () => {
		beforeEach(() => {
			handler.initializeContainer(container);
		});

		it('should handle attachment without content', () => {
			state.addAttachment({
				type: 'file',
				name: 'empty.md',
				path: '/empty.md',
				content: '',
			});

			const preview = container.querySelector('.attachment-preview');
			expect(preview).toBeTruthy();
		});

		it('should handle image attachment without content (fallback icon)', () => {
			state.addAttachment({
				type: 'image',
				name: 'missing.jpg',
				path: '/missing.jpg',
				content: '',
			});

			const preview = container.querySelector('.attachment-preview');
			expect(preview?.textContent).toContain('🖼️');
		});

		it('should handle rapid attachment additions', () => {
			for (let i = 0; i < 10; i++) {
				state.addAttachment({
					type: 'file',
					name: `file${i}.md`,
					path: `/file${i}.md`,
					content: `content${i}`,
				});
			}

			const previewItems = container.querySelectorAll('.attachment-preview-item');
			expect(previewItems.length).toBe(10);
		});

		it('should handle removing all attachments one by one', () => {
			// Add 3 attachments
			for (let i = 0; i < 3; i++) {
				state.addAttachment({
					type: 'file',
					name: `file${i}.md`,
					path: `/file${i}.md`,
					content: `content${i}`,
				});
			}

			// Remove them one by one
			while (state.currentAttachments.length > 0) {
				const removeBtn = container.querySelector('.attachment-preview-item button') as HTMLButtonElement;
				removeBtn.click();
			}

			expect(state.currentAttachments).toHaveLength(0);
			const preview = container.querySelector('.attachment-preview') as HTMLElement;
			expect(preview.style.display).toBe('none');
		});

		it('should not throw when updatePreview called before initialization', () => {
			const _newHandler = new AttachmentHandler(mockApp, state);

			// Trigger state change without initializing container
			state.addAttachment({
				type: 'file',
				name: 'test.md',
				path: '/test.md',
				content: 'content',
			});

			// Should not throw
			expect(() => state.currentAttachments).not.toThrow();
		});
	});

	describe('Integration with ChatViewState', () => {
		beforeEach(() => {
			handler.initializeContainer(container);
		});

		it('should sync with state additions', () => {
			const attachment: Attachment = {
				type: 'file',
				name: 'test.md',
				path: '/test.md',
				content: 'content',
			};

			state.addAttachment(attachment);

			expect(handler.getAttachments()).toContain(attachment);
		});

		it('should sync with state removals', () => {
			state.addAttachment({
				type: 'file',
				name: 'test.md',
				path: '/test.md',
				content: 'content',
			});

			state.removeAttachment(0);

			expect(handler.getAttachments()).toHaveLength(0);
		});

		it('should sync with state clear', () => {
			state.addAttachment({
				type: 'file',
				name: 'test1.md',
				path: '/test1.md',
				content: 'content1',
			});
			state.addAttachment({
				type: 'file',
				name: 'test2.md',
				path: '/test2.md',
				content: 'content2',
			});

			state.clearAttachments();

			expect(handler.getAttachments()).toHaveLength(0);
		});
	});
});
