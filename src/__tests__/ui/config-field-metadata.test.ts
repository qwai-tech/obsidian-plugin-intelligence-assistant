import { Setting } from 'obsidian';
import { applyConfigFieldMetadata } from '@/ui/utils/config-field-metadata';

describe('applyConfigFieldMetadata', () => {
	it('shows the description and a numeric range, without type or default noise', () => {
		const setting = applyConfigFieldMetadata(new Setting(document.createElement('div')), {
			path: 'agents[].temperature',
			label: 'Temperature',
			description: 'Higher values make replies more varied.',
		});

		expect(setting.nameEl.textContent).toBe('Temperature');
		expect(setting.descEl.textContent).toBe('Higher values make replies more varied. (0–2)');
	});

	it('shows just the description when the field has no range', () => {
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

