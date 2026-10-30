import 'obsidian';
import { renderIcon } from '@/ui/utils/icon';

describe('renderIcon', () => {
	it('draws Lucide icon ids, keeps emoji as text and falls back when empty', () => {
		const lucide = document.createElement('div');
		const emoji = document.createElement('div');
		const empty = document.createElement('div');

		renderIcon(lucide, 'layout-dashboard');
		renderIcon(emoji, '🦉');
		renderIcon(empty, undefined);

		expect(lucide.querySelector('[data-icon]')?.getAttribute('data-icon')).toBe('layout-dashboard');
		expect(lucide.textContent).toBe('');
		expect(emoji.textContent).toBe('🦉');
		expect(empty.querySelector('[data-icon]')?.getAttribute('data-icon')).toBe('bot');
	});
});
