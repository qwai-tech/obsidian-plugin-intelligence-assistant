import { App } from 'obsidian';
import { builtinToolDefinitions } from '@/features/tools';
import en from '@/i18n/locales/en.json';

describe('built-in tool labels', () => {
	const builtIn = (en as { settings: { tools: { builtIn: { toolNames: Record<string, string> } } } }).settings.tools.builtIn;

	it.each(builtinToolDefinitions(new App() as never).map(definition => definition.name))('%s has a translatable name', (tool) => {
		expect(builtIn.toolNames[tool]).toEqual(expect.any(String));
	});
});
