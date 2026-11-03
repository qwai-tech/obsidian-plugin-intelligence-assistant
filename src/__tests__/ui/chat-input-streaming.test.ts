import { ChatInputComponent } from '@/ui/chat/chat-input.component';

describe('chat composer while a reply streams', () => {
	function composer(): ChatInputComponent {
		const input = Object.create(ChatInputComponent.prototype) as ChatInputComponent;
		input.sendBtn = document.createElement('button');
		input.stopBtn = document.createElement('button');
		input.stopBtn.classList.add('ia-hidden');
		return input;
	}

	it('shows Stop in place of Send while streaming, and Send again afterwards', () => {
		const input = composer();

		input.setStreaming(true);
		expect([input.sendBtn.classList.contains('ia-hidden'), input.stopBtn.classList.contains('ia-hidden')]).toEqual([true, false]);

		input.setStreaming(false);
		expect([input.sendBtn.classList.contains('ia-hidden'), input.stopBtn.classList.contains('ia-hidden')]).toEqual([false, true]);
	});
});
