import { ensureDefaultAgent } from '@/features/agent/agent-service';
import { userConfigToPluginSettings } from '@/features/settings/settings-codec';
import { migrateSettings } from '@/features/settings/settings-migrations';
import { BUILTIN_AGENT_PRESETS } from '@/features/agent/presets/builtin-agents';
import { BUILTIN_PROMPT_PRESETS } from '@/features/agent/presets/builtin-prompts';
import { DEFAULT_AGENT_ID, DEFAULT_MODEL_CONFIG } from '@/core/constants';
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
	it('sets up the default agent, every built-in agent and prompt, and makes the default agent active', async () => {
		const settings = freshSettings();
		settings.defaultModel = 'openai:gpt-4o';
		const save = jest.fn(async () => undefined);

		await ensureDefaultAgent(settings, save);

		const agent = defaultAgentOf(settings);
		expect(settings.agents[0]).toBe(agent);
		expect(agent.modelStrategy).toEqual({ strategy: 'default', modelId: 'openai:gpt-4o' });
		expect(agent.toolAccess.sources['builtin:builtin']).toEqual(['builtin:builtin:read_file']);
		expect(settings.activeAgentId).toBe(DEFAULT_AGENT_ID);
		expect(BUILTIN_AGENT_PRESETS.every(preset => settings.agents.some(a => a.id === preset.id))).toBe(true);
		expect(BUILTIN_PROMPT_PRESETS.every(preset => settings.systemPrompts.some(p => p.id === preset.id))).toBe(true);
		expect(settings.defaultChatMode).toBe('agent');
		expect(save).toHaveBeenCalledTimes(1);
	});

	it('saves nothing when everything is already set up', async () => {
		const settings = freshSettings();
		await ensureDefaultAgent(settings, async () => undefined);
		const save = jest.fn(async () => undefined);

		await ensureDefaultAgent(settings, save);

		expect(save).not.toHaveBeenCalled();
	});

	it('keeps the default agent\'s built-in tool access in step with the globally enabled tools, unless it has all of them', async () => {
		const settings = freshSettings();
		await ensureDefaultAgent(settings, async () => undefined);
		settings.builtInTools.forEach(tool => { tool.enabled = true; });

		await ensureDefaultAgent(settings, async () => undefined);
		expect(defaultAgentOf(settings).toolAccess.sources['builtin:builtin']).toEqual(['builtin:builtin:read_file', 'builtin:builtin:write_file']);

		defaultAgentOf(settings).toolAccess.sources['builtin:builtin'] = 'all';
		settings.builtInTools.forEach(tool => { tool.enabled = false; });
		await ensureDefaultAgent(settings, async () => undefined);
		expect(defaultAgentOf(settings).toolAccess.sources['builtin:builtin']).toBe('all');
	});

	it('repairs the old token limit and a system prompt that no longer exists', async () => {
		const settings = freshSettings();
		await ensureDefaultAgent(settings, async () => undefined);
		const agent = defaultAgentOf(settings);
		agent.maxTokens = 2000;
		settings.systemPrompts = settings.systemPrompts.filter(prompt => prompt.id !== agent.systemPromptId);

		await ensureDefaultAgent(settings, async () => undefined);

		expect(agent.maxTokens).toBe(DEFAULT_MODEL_CONFIG.MAX_TOKENS);
		expect(settings.systemPrompts.some(prompt => prompt.id === agent.systemPromptId)).toBe(true);
	});
});
