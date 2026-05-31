import { ChatHeaderComponent } from '../chat-header.component';
import { ChatViewState } from '@/presentation/state/chat-view-state';
import { initI18n } from '@/i18n';

describe('ChatHeaderComponent', () => {
	beforeEach(() => {
		initI18n('en');
	});

	it('renders one isolated icon container per header icon button', () => {
		const parent = document.createElement('div');

		new ChatHeaderComponent(
			parent,
			{
				app: {
					setting: {
						open: jest.fn(),
						openTabById: jest.fn(),
					},
				},
			} as never,
			new ChatViewState(),
			{
				onToggleConversations: jest.fn(),
				onShowCapabilities: jest.fn(),
				onNewChat: jest.fn(),
			}
		);

		const buttons = Array.from(parent.querySelectorAll('.chat-header-icon-btn'));
		expect(buttons).toHaveLength(4);

		for (const button of buttons) {
			expect(button.querySelectorAll('.chat-header-icon-btn__icon')).toHaveLength(1);
			expect(button.children).toHaveLength(1);
		}
	});

	it('opens the capability panel from the header button', () => {
		const parent = document.createElement('div');
		const onShowCapabilities = jest.fn();

		new ChatHeaderComponent(
			parent,
			{
				app: {
					setting: {
						open: jest.fn(),
						openTabById: jest.fn(),
					},
				},
			} as never,
			new ChatViewState(),
			{
				onToggleConversations: jest.fn(),
				onShowCapabilities,
				onNewChat: jest.fn(),
			}
		);

		const button = parent.querySelector('[data-testid="ia-chat-agent-capabilities-btn"]') as HTMLButtonElement;
		button.click();

		expect(onShowCapabilities).toHaveBeenCalledTimes(1);
	});
});
