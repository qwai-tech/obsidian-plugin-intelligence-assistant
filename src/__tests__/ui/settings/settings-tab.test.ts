import { App, type SettingDefinitionItem } from 'obsidian';
import { IntelligenceAssistantSettingTab } from '@/ui/settings/settings-tab';
import { SectionPage } from '@/ui/settings/section-page';
import { DEFAULT_SETTINGS } from '@/features/settings/settings-codec';

jest.mock('@/i18n', () => ({ t: (key: string) => key }));

const makePlugin = () => {
	const settings = structuredClone(DEFAULT_SETTINGS);
	return {
		settings,
		manifest: { version: '9.9.9' },
		refreshSecretKeys: jest.fn(),
		updateSettings: jest.fn(async (change: (value: typeof settings) => void) => change(settings)),
		services: { conversations: { getConversationCount: jest.fn(async () => 3) } },
	};
};

const flattened = (items: SettingDefinitionItem[]): SettingDefinitionItem[] => items.flatMap(item =>
	'type' in item && item.type === 'group' ? flattened((item.items ?? []) as SettingDefinitionItem[]) : [item]
);

describe('IntelligenceAssistantSettingTab', () => {
	it('retains searchable General controls inside the restored nine top-level Tabs', () => {
		const plugin = makePlugin();
		const tab = new IntelligenceAssistantSettingTab(new App(), plugin as never);

		const items = tab.getSettingDefinitions();

		const controls = flattened(items).filter(item => 'control' in item && item.control).map(item => (item as { control: { key: string } }).control.key);
		expect(controls).toEqual(['conversationTitleMode', 'conversationIconEnabled']);
		expect(flattened(items)).toContainEqual(expect.objectContaining({ name: 'settings.general.defaultModel.name', render: expect.any(Function) }));
		expect(items[0]).toMatchObject({
			aliases: ['settings.tabs.general', 'settings.tabs.llm', 'settings.tabs.mcp', 'settings.tabs.tools', 'settings.tabs.rag', 'settings.tabs.prompts', 'settings.tabs.agents', 'settings.tabs.quickActions', 'settings.tabs.usage'],
			render: expect.any(Function),
		});
		expect(items[1]).toMatchObject({ type: 'group', cls: 'ia-settings-general-group' });
		expect(flattened(items).some(item => 'type' in item && item.type === 'page')).toBe(false);
	});

	it('builds its definitions before the plugin has loaded any settings', () => {
		const plugin = { manifest: { version: '1.0.0' }, refreshSecretKeys: () => { throw new Error('settings not loaded'); } };
		const tab = new IntelligenceAssistantSettingTab(new App(), plugin as never);

		expect(() => tab.getSettingDefinitions()).not.toThrow();
	});

	it('reads and writes control values through the plugin settings', async () => {
		const plugin = makePlugin();
		const tab = new IntelligenceAssistantSettingTab(new App(), plugin as never);

		await tab.setControlValue('defaultModel', 'openai:gpt-4o');

		expect(plugin.updateSettings).toHaveBeenCalledTimes(1);
		expect(plugin.settings.defaultModel).toBe('openai:gpt-4o');
		expect(tab.getControlValue('defaultModel')).toBe('openai:gpt-4o');
	});
});

describe('SectionPage', () => {
	it('renders its section into a cleared container and can re-render itself', () => {
		let renders = 0;
		let rerender: () => void = () => undefined;
		const page = new SectionPage('Title', (el, again) => {
			renders += 1;
			rerender = again;
			el.createDiv({ text: `render ${renders}` });
		});

		page.display();
		rerender();

		expect(page.title).toBe('Title');
		expect(renders).toBe(2);
		expect(page.containerEl.textContent).toBe('render 2');
	});
});
