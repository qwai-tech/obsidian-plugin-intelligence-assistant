import { ensureDefaultAgent } from '@/features/agent/agent-service';
import { userConfigToPluginSettings } from '@/features/settings/settings-codec';
import { migrateSettings } from '@/features/settings/settings-migrations';
import { BUILTIN_AGENT_PRESETS } from '@/features/agent/presets/builtin-agents';
import { BUILTIN_PROMPT_PRESETS } from '@/features/agent/presets/builtin-prompts';
import { DEFAULT_AGENT_ID } from '@/core/constants';
import type { PluginSettings } from '@/features/settings';

const freshSettings = (): PluginSettings => {
	const settings = userConfigToPluginSettings(null);
	settings.builtInTools = [
		{ type: 'read_file', enabled: true },
		{ type: 'write_file', enabled: false },
	] as PluginSettings['builtInTools'];
	migrateSettings(settings);
	return settings;
};

const defaultAgentOf = (settings: PluginSettings) => settings.agents.find(agent => agent.id === DEFAULT_AGENT_ID)!;

describe('ensureDefaultAgent', () => {
	it('sets up the default agent, every built-in agent and prompt, and makes the default agent active', () => {
		const settings = freshSettings();
		settings.defaultModel = 'openai:gpt-4o';

		ensureDefaultAgent(settings);

		const agent = defaultAgentOf(settings);
		expect(settings.agents[0]).toBe(agent);
		expect(agent.modelStrategy).toEqual({ strategy: 'default', modelId: 'openai:gpt-4o' });
		expect(agent.toolAccess.sources['builtin:builtin']).toEqual(['builtin:builtin:read_file']);
		expect(settings.activeAgentId).toBe(DEFAULT_AGENT_ID);
		expect(BUILTIN_AGENT_PRESETS.every(preset => settings.agents.some(a => a.id === preset.id))).toBe(true);
		expect(BUILTIN_PROMPT_PRESETS.every(preset => settings.systemPrompts.some(p => p.id === preset.id))).toBe(true);
		expect(settings.defaultChatMode).toBe('chat');
	});

	it('changes nothing when everything is already set up', () => {
		const settings = freshSettings();
		ensureDefaultAgent(settings);
		const before = JSON.stringify(settings);

		ensureDefaultAgent(settings);

		expect(JSON.stringify(settings)).toBe(before);
	});

	it('keeps the default agent\'s built-in tool access in step with the globally enabled tools, unless it has all of them', () => {
		const settings = freshSettings();
		ensureDefaultAgent(settings);
		settings.builtInTools.forEach(tool => { tool.enabled = true; });

		ensureDefaultAgent(settings);
		expect(defaultAgentOf(settings).toolAccess.sources['builtin:builtin']).toEqual(['builtin:builtin:read_file', 'builtin:builtin:write_file']);

		defaultAgentOf(settings).toolAccess.sources['builtin:builtin'] = 'all';
		settings.builtInTools.forEach(tool => { tool.enabled = false; });
		ensureDefaultAgent(settings);
		expect(defaultAgentOf(settings).toolAccess.sources['builtin:builtin']).toBe('all');
	});

	it('preserves the saved token budget while repairing a missing system prompt', () => {
		const settings = freshSettings();
		ensureDefaultAgent(settings);
		const agent = defaultAgentOf(settings);
		agent.maxTokens = 2000;
		settings.systemPrompts = settings.systemPrompts.filter(prompt => prompt.id !== agent.systemPromptId);

		ensureDefaultAgent(settings);

		expect(agent.maxTokens).toBe(2000);
		expect(settings.systemPrompts.some(prompt => prompt.id === agent.systemPromptId)).toBe(true);
	});

	it('names built-in prompts and the default agent in sentence case, renaming ones saved under the old names', () => {
		const settings = freshSettings();
		ensureDefaultAgent(settings);
		const librarian = settings.systemPrompts.find(prompt => prompt.id === 'prompt-librarian')!;
		librarian.name = 'Librarian System Prompt';

		ensureDefaultAgent(settings);

		expect(librarian.name).toBe('Librarian system prompt');
		expect(defaultAgentOf(settings).description).toMatch(/^Advanced Obsidian agent /);
	});
});

