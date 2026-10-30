import 'obsidian';
import { renderSubTabs } from '@/ui/settings/sub-tabs';

describe('renderSubTabs', () => {
	it('renders the active tab and switches content and state on click', () => {
		const container = document.createElement('div');
		const selected: string[] = [];

		renderSubTabs(container, {
			tabs: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }],
			active: 'a',
			testId: 'tabs',
			onSelect: id => selected.push(id),
			render: (content, id) => content.setText(`content ${id}`),
		});
		const [alpha, beta] = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-testid="tabs"]'));

		expect(alpha.classList.contains('is-active')).toBe(true);
		expect(container.querySelector('.settings-tab-content')?.textContent).toBe('content a');

		beta.click();

		expect(beta.classList.contains('is-active')).toBe(true);
		expect(alpha.classList.contains('is-active')).toBe(false);
		expect(beta.getAttribute('data-subtab-id')).toBe('b');
		expect(container.querySelector('.settings-tab-content')?.textContent).toBe('content b');
		expect(selected).toEqual(['b']);
	});
});
