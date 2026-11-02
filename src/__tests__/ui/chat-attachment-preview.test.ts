import { ChatInputComponent } from '@/ui/chat/chat-input.component';
import { ChatViewState } from '@/ui/state/chat-view-state';
import { initI18n } from '@/i18n';

describe('chat attachment preview', () => {
	beforeAll(() => initI18n('en'));

	it('names each remove button after the attachment it removes', () => {
		const state = new ChatViewState();
		state.currentAttachments.push({ type: 'image', name: 'qa-screen.png', path: 'qa-screen.png', content: 'data:image/png;base64,QUJD' });
		const input = Object.create(ChatInputComponent.prototype) as ChatInputComponent;
		input.attachmentContainer = document.createElement('div');
		Object.assign(input, { state });

		input.updateAttachmentPreview();

		const remove = input.attachmentContainer.querySelector('.ia-attachment-remove')!;
		expect(remove.getAttribute('aria-label')).toBe('Remove qa-screen.png');
		expect(remove.getAttribute('type')).toBe('button');
	});
});
