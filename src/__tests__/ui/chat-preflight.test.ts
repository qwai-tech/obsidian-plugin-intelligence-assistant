import { ChatMessageList } from '@/ui/chat/chat-message-list';
import { ChatViewState } from '@/ui/state/chat-view-state';
import { initI18n } from '@/i18n';

describe('agent task preflight card', () => {
	beforeAll(() => initI18n('en'));

	it('lists each preflight field as its own list item', () => {
		const list = new ChatMessageList(document.createElement('div'), {} as never, {} as never, new ChatViewState(), {});
		list.element.scrollTo = jest.fn();

		list.showPreflight('QA manual AI', ['Agent: Intelligence Assistant', 'Reads: active note and context snapshot', 'Tools: 13 enabled']);

		const items = Array.from(list.element.querySelectorAll('ul.ia-agent-preflight-card__items > li'));
		expect(items.map(item => item.textContent)).toEqual(['Agent: Intelligence Assistant', 'Reads: active note and context snapshot', 'Tools: 13 enabled']);
	});
});
