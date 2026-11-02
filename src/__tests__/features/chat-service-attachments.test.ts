import { ChatService } from '@/features/chat/chat.service';
import type { Message } from '@/features/conversations';

const service = new ChatService({ fileSystem: {} as any, knowledge: {} as any, webSearchService: {} as any, settings: () => ({ llmConfigs: [], defaultModel: 'm' }) });
const image = { type: 'image' as const, name: 'qa-screen.png', path: 'qa-screen.png', content: 'data:image/png;base64,QUJD' };

describe('ChatService.prepareLlmMessages attachments', () => {
	it('keeps image attachments on the message so vision models receive the image', () => {
		const message: Message = { role: 'user', content: 'Describe this image', attachments: [image] };

		const [prepared] = service.prepareLlmMessages([message], message, 'Describe this image');

		expect(prepared.attachments).toEqual([image]);
	});

	it('inlines file attachments as text and sends no file payload', () => {
		const file = { type: 'file' as const, name: 'notes.txt', path: 'notes.txt', content: 'FILE_BODY' };
		const message: Message = { role: 'user', content: 'Summarise', attachments: [file] };

		const [prepared] = service.prepareLlmMessages([message], message, 'Summarise');

		expect(prepared.content).toContain('FILE_BODY');
		expect(prepared.attachments).toBeUndefined();
	});
});
