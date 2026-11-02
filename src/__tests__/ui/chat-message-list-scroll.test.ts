import { ChatMessageList } from '@/ui/chat/chat-message-list';
import { ChatViewState } from '@/ui/state/chat-view-state';

function listScrolledTo(scrollTop: number): ChatMessageList {
	const list = new ChatMessageList(document.createElement('div'), {} as never, {} as never, new ChatViewState(), {});
	Object.defineProperties(list.element, {
		scrollHeight: { value: 2_000 },
		clientHeight: { value: 500 },
		scrollTop: { value: scrollTop, writable: true },
	});
	return list;
}

describe('ChatMessageList scroll position', () => {
	it('is away from the end when the reader has scrolled up', () => {
		expect(listScrolledTo(600).isAwayFromEnd()).toBe(true);
	});

	it('is at the end when the last message is in view', () => {
		expect(listScrolledTo(1_450).isAwayFromEnd()).toBe(false);
	});
});
