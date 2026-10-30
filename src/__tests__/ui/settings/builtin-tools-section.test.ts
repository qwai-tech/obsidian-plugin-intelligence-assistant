import 'obsidian';
import { renderBuiltinToolsSection } from '@/ui/settings/tabs/tools/builtin-tools-section';
import { DEFAULT_SETTINGS } from '@/features/settings/settings-codec';

jest.mock('@/i18n', () => ({ t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key }));

describe('renderBuiltinToolsSection', () => {
	it('lists every configured built-in tool with its toggle', () => {
		const builtInTools = structuredClone(DEFAULT_SETTINGS.builtInTools);
		const content = document.createElement('div');

		renderBuiltinToolsSection(content, { app: {}, settings: { builtInTools } } as never);

		const rows = Array.from(content.querySelectorAll('[data-testid="ia-tools-builtin-row"]')).map(row => row.getAttribute('data-tool-type'));
		expect(rows).toEqual(builtInTools.map(tool => tool.type));
		expect(rows).toEqual(expect.arrayContaining(['update_properties', 'read_canvas', 'read_pdf', 'make_link']));
	});
});
