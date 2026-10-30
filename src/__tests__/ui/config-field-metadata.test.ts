import { Setting } from 'obsidian';
import { applyConfigFieldMetadata } from '@/ui/utils/config-field-metadata';

describe('applyConfigFieldMetadata', () => {
	it('shows the translated description as written, which already states any range', () => {
		const setting = applyConfigFieldMetadata(new Setting(document.createElement('div')), {
			path: 'agents[].temperature',
			label: 'Temperature',
			description: 'Controls randomness (0.0 - 2.0)',
		});

		expect(setting.nameEl.textContent).toBe('Temperature');
		expect(setting.descEl.textContent).toBe('Controls randomness (0.0 - 2.0)');
	});

	it('shows just the description for other fields', () => {
		const setting = applyConfigFieldMetadata(new Setting(document.createElement('div')), {
			path: 'ragConfig.enabled',
			label: 'Enable RAG',
			description: 'Use your notes as context.',
		});

		expect(setting.descEl.textContent).toBe('Use your notes as context.');
	});

	it('marks required fields', () => {
		const setting = applyConfigFieldMetadata(new Setting(document.createElement('div')), { path: 'mcpServers[].command', label: 'Command' });

		expect(setting.nameEl.getAttribute('data-required')).toBe('true');
	});
});

