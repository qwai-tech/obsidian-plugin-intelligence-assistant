import { ChatHeaderComponent } from '../chat-header.component';
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

	it('shows the active agent with its own icon, or its emoji, next to its name', () => {
		const parent = document.createElement('div');
		const header = new ChatHeaderComponent(parent, { app: { setting: { open: jest.fn(), openTabById: jest.fn() } } } as never, {
			onToggleConversations: jest.fn(),
			onShowCapabilities: jest.fn(),
			onNewChat: jest.fn(),
		});
		const badge = parent.querySelector('.chat-agent-header-badge') as HTMLElement;

		header.updateAgentBadge({ name: 'Intelligence Assistant', icon: 'sparkles' });
		expect(badge.querySelector('[data-icon="sparkles"]')).not.toBeNull();
		expect(badge.textContent).toBe('Intelligence Assistant');

		header.updateAgentBadge({ name: 'Scribe', icon: '🖋️' });
		expect(badge.textContent).toBe('🖋️Scribe');

		header.updateAgentBadge(null);
		expect(badge.classList.contains('ia-hidden')).toBe(true);
	});
});

