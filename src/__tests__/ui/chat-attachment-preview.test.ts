import { ChatInputComponent } from '@/ui/chat/chat-input.component';
import { ChatViewState } from '@/ui/state/chat-view-state';
import { initI18n } from '@/i18n';

describe('chat attachment preview', () => {
	beforeAll(() => initI18n('en'));

	it('names each remove button after the attachment it removes', () => {
		const input = Object.assign(Object.create(ChatInputComponent.prototype) as ChatInputComponent, {
			attachmentContainer: document.createElement('div'),
			state: new ChatViewState(),
		});
		(input as unknown as { state: ChatViewState }).state.currentAttachments.push({ type: 'image', name: 'qa-screen.png', path: 'qa-screen.png', content: 'data:image/png;base64,QUJD' });

		input.updateAttachmentPreview();

		const remove = input.attachmentContainer.querySelector('.ia-attachment-remove')!;
		expect(remove.getAttribute('aria-label')).toBe('Remove qa-screen.png');
		expect(remove.getAttribute('type')).toBe('button');
	});
});
