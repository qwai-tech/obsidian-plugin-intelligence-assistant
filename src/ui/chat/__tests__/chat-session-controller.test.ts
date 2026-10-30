import { Notice, TFile, TFolder } from 'obsidian';
import { ModelManager, type ModelInfo } from '@qwai/obsidian-llm';
import type IntelligenceAssistantPlugin from '@plugin';
import { ChatSessionController } from '../chat-session-controller';
import type { ChatInputComponent } from '../chat-input.component';
import type { ChatHeaderComponent } from '../chat-header.component';
import { ChatViewState } from '@/ui/state/chat-view-state';
import type { Agent, SystemPrompt } from '@/features/agent';
import type { ChatMode } from '@/features/chat';
import type { Conversation, ConversationConfig } from '@/features/conversations';
import type { PluginSettings } from '@/features/settings';
import type { RegisteredTool, ToolRegistry } from '@/features/tools';
import { DEFAULT_AGENT_ID, DEFAULT_CHAT_SAMPLING } from '@/core/constants';
import { createTestAgent, createTestSettings } from '@/test-support/test-utils';
import { initI18n, t } from '@/i18n';

interface FakeInput {
	modelSelect: HTMLSelectElement;
	agentSelector: HTMLSelectElement;
	ragActionItem: HTMLElement | null;
	webActionItem: HTMLElement | null;
	updateModeSelector: jest.Mock<void, [ChatMode]>;
	refreshAgentSelect: jest.Mock<void, [string?]>;
	setImageButtonVisible: jest.Mock<void, [boolean]>;
	updateActionToggleState: jest.Mock<void, [HTMLElement, boolean, boolean, string]>;
}

interface FakeHeader {
	updateAgentBadge: jest.Mock<void, [{ name?: string; icon?: string } | null]>;
}

interface FakePlugin {
	settings: PluginSettings;
	ensureDefaultAgent: jest.Mock<Promise<void>, []>;
	updateSettings: jest.Mock<Promise<void>, [(settings: PluginSettings) => void]>;
}

interface Harness {
	controller: ChatSessionController;
	state: ChatViewState;
	settings: PluginSettings;
	plugin: FakePlugin;
	input: FakeInput;
	header: FakeHeader;
	refreshRagStatus: jest.Mock<Promise<void>, []>;
}

const MODEL_IDS = ['gpt-4o', 'claude-sonnet', 'vision-model'];

function makeSelect(values: string[]): HTMLSelectElement {
	const select = document.createElement('select');
	for (const value of ['', ...values]) {
		const option = document.createElement('option');
		option.value = value;
		select.appendChild(option);
	}
	return select;
}

function makePrompt(id: string, enabled: boolean): SystemPrompt {
	return { id, name: id, content: `${id} prompt`, enabled, createdAt: 0, updatedAt: 0 };
}

function makeSettings(overrides: Partial<PluginSettings> = {}): PluginSettings {
	const base = createTestSettings();
	return createTestSettings({
		agents: [],
		activeAgentId: null,
		activeSystemPromptId: null,
		systemPrompts: [makePrompt('concise', true), makePrompt('retired', false)],
		defaultModel: 'gpt-4o',
		defaultChatMode: 'chat',
		ragConfig: { ...base.ragConfig, enabled: true },
		webSearchConfig: { ...base.webSearchConfig, enabled: true },
		...overrides,
	});
}

function makeHarness(settings: PluginSettings, mode: ChatMode = 'chat'): Harness {
	const state = new ChatViewState();
	state.mode = mode;
	const input: FakeInput = {
		modelSelect: makeSelect(MODEL_IDS),
		agentSelector: makeSelect(settings.agents.map(agent => agent.id)),
		ragActionItem: document.createElement('div'),
		webActionItem: document.createElement('div'),
		updateModeSelector: jest.fn((_mode: ChatMode) => undefined),
		refreshAgentSelect: jest.fn((_agentId?: string) => undefined),
		setImageButtonVisible: jest.fn((_visible: boolean) => undefined),
		updateActionToggleState: jest.fn((_item: HTMLElement, _configured: boolean, _on: boolean, _label: string) => undefined),
	};
	const header: FakeHeader = { updateAgentBadge: jest.fn((_agent: { name?: string; icon?: string } | null) => undefined) };
	const refreshRagStatus = jest.fn(async () => undefined);
	const plugin: FakePlugin = {
		settings,
		ensureDefaultAgent: jest.fn(async () => undefined),
		updateSettings: jest.fn(async (change: (settings: PluginSettings) => void) => {
			change(settings);
		}),
	};
	const controller = new ChatSessionController(plugin as unknown as IntelligenceAssistantPlugin, state, {
		input: input as unknown as ChatInputComponent,
		header: header as unknown as ChatHeaderComponent,
		refreshRagStatus,
	});
	return { controller, state, settings, plugin, input, header, refreshRagStatus };
}

function makeConversation(config?: ConversationConfig): Conversation {
	return { id: 'c1', title: 'Old chat', messages: [], createdAt: 0, updatedAt: 0, config };
}

function makeModel(id: string, capabilities: ModelInfo['capabilities']): ModelInfo {
	return { id, name: id, provider: 'openai', capabilities, enabled: true };
}

function makeFile(path: string): TFile {
	return Object.assign(new TFile(), { path, name: path.split('/').pop() ?? path });
}

function makeFolder(path: string): TFolder {
	return Object.assign(new TFolder(), { path, name: path });
}

const researcher: Agent = createTestAgent({
	id: 'researcher',
	name: 'Researcher',
	temperature: 0.2,
	maxTokens: 2048,
	systemPromptId: 'research-prompt',
	modelStrategy: { strategy: 'fixed', modelId: 'claude-sonnet' },
	ragEnabled: true,
	webSearchEnabled: true,
});

const writer: Agent = createTestAgent({
	id: 'writer',
	name: 'Writer',
	temperature: 0.9,
	maxTokens: 512,
	systemPromptId: 'writer-prompt',
	modelStrategy: { strategy: 'chat-view' },
	ragEnabled: false,
	webSearchEnabled: false,
});

const generalist: Agent = createTestAgent({
	id: DEFAULT_AGENT_ID,
	name: 'Generalist',
	systemPromptId: 'generalist-prompt',
	modelStrategy: { strategy: 'default' },
});

describe('ChatSessionController', () => {
	beforeAll(() => {
		initI18n('en');
	});

	beforeEach(() => {
		jest.clearAllMocks();
		jest.spyOn(ModelManager, 'getAllAvailableModels').mockResolvedValue([]);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('switching to agent mode', () => {
		it('activates the previously active agent and applies its model, sampling and tools', async () => {
			const { controller, state, settings, input, header } = makeHarness(makeSettings({ agents: [researcher, writer], activeAgentId: 'researcher' }));

			await controller.changeMode('agent');

			expect(state.mode).toBe('agent');
			expect(settings.activeAgentId).toBe('researcher');
			expect(settings.activeSystemPromptId).toBe('research-prompt');
			expect(input.modelSelect.value).toBe('claude-sonnet');
			expect(state.temperature).toBe(0.2);
			expect(state.maxTokens).toBe(2048);
			expect(state.enableRAG).toBe(true);
			expect(state.enableWebSearch).toBe(true);
			expect(input.refreshAgentSelect).toHaveBeenCalledWith('researcher');
			expect(input.updateModeSelector).toHaveBeenLastCalledWith('agent');
			expect(header.updateAgentBadge).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Researcher' }));
			expect(Notice).not.toHaveBeenCalled();
		});

		it('falls back to the built-in default agent when no agent was active', async () => {
			const { controller, settings, header } = makeHarness(makeSettings({ agents: [researcher, generalist] }));

			await controller.changeMode('agent');

			expect(settings.activeAgentId).toBe(DEFAULT_AGENT_ID);
			expect(header.updateAgentBadge).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Generalist' }));
		});

		it('creates the default agent first when there are no agents yet', async () => {
			const settings = makeSettings();
			const { controller, plugin, header } = makeHarness(settings);
			plugin.ensureDefaultAgent.mockImplementation(async () => {
				settings.agents.push(generalist);
			});

			await controller.changeMode('agent');

			expect(plugin.ensureDefaultAgent).toHaveBeenCalledTimes(1);
			expect(settings.activeAgentId).toBe(DEFAULT_AGENT_ID);
			expect(header.updateAgentBadge).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Generalist' }));
		});

		it('tells the user to configure agents when none exist and none can be created', async () => {
			const { controller, state, settings, input, header } = makeHarness(makeSettings({ activeSystemPromptId: 'concise' }));

			await controller.changeMode('agent');

			expect(state.mode).toBe('agent');
			expect(Notice).toHaveBeenCalledWith(t('chat.notices.noAgents'));
			expect(settings.activeAgentId).toBeNull();
			expect(settings.activeSystemPromptId).toBe('concise');
			expect(input.refreshAgentSelect).toHaveBeenCalledWith();
			expect(header.updateAgentBadge).toHaveBeenLastCalledWith(null);
		});

		it('keeps the model picked in the chat view for an agent that follows the chat view', async () => {
			const { controller, input } = makeHarness(makeSettings({ agents: [writer], activeAgentId: 'writer' }));
			input.modelSelect.value = 'vision-model';

			await controller.changeMode('agent');

			expect(input.modelSelect.value).toBe('vision-model');
		});

		it('still activates the agent when refreshing the RAG status fails', async () => {
			const { controller, settings, header, refreshRagStatus } = makeHarness(makeSettings({ agents: [researcher], activeAgentId: 'researcher' }));
			refreshRagStatus.mockRejectedValue(new Error('index offline'));
			const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

			await controller.changeMode('agent');

			expect(settings.activeAgentId).toBe('researcher');
			expect(header.updateAgentBadge).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Researcher' }));
			expect(consoleError).toHaveBeenCalled();
		});
	});

	describe('switching to chat mode', () => {
		it('deactivates the agent, keeps the current system prompt and clears the agent badge', async () => {
			const { controller, state, settings, input, header } = makeHarness(
				makeSettings({ agents: [researcher], activeAgentId: 'researcher', activeSystemPromptId: 'concise' }),
				'agent',
			);

			await controller.changeMode('chat');

			expect(state.mode).toBe('chat');
			expect(settings.activeAgentId).toBeNull();
			expect(settings.activeSystemPromptId).toBe('concise');
			expect(input.updateModeSelector).toHaveBeenLastCalledWith('chat');
			expect(header.updateAgentBadge).toHaveBeenLastCalledWith(null);
		});
	});

	describe('picking an agent', () => {
		it('switches to the picked agent and puts the view into agent mode', async () => {
			const { controller, state, settings, input, header } = makeHarness(makeSettings({ agents: [researcher, writer], activeAgentId: 'writer' }), 'chat');

			await controller.selectAgent('researcher');

			expect(state.mode).toBe('agent');
			expect(input.updateModeSelector).toHaveBeenCalledWith('agent');
			expect(settings.activeAgentId).toBe('researcher');
			expect(input.modelSelect.value).toBe('claude-sonnet');
			expect(header.updateAgentBadge).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Researcher' }));
			expect(Notice).not.toHaveBeenCalled();
		});

		it('does not reapply the agent that is already active', async () => {
			const { controller, state, plugin } = makeHarness(makeSettings({ agents: [researcher], activeAgentId: 'researcher' }), 'agent');
			state.temperature = 1.3;

			await controller.selectAgent('researcher');

			expect(plugin.updateSettings).not.toHaveBeenCalled();
			expect(state.temperature).toBe(1.3);
			expect(Notice).not.toHaveBeenCalled();
		});

		it('clears the active agent when the empty choice is picked', async () => {
			const { controller, settings } = makeHarness(makeSettings({ agents: [researcher], activeAgentId: 'researcher', activeSystemPromptId: 'concise' }), 'agent');

			await controller.selectAgent('');

			expect(settings.activeAgentId).toBeNull();
			expect(settings.activeSystemPromptId).toBe('concise');
		});
	});

	describe('opening a saved conversation', () => {
		it('only refreshes the mode selector when the conversation has no stored config', async () => {
			const { controller, plugin, input } = makeHarness(makeSettings({ agents: [researcher] }), 'agent');

			await controller.applyConversation(makeConversation());

			expect(input.updateModeSelector).toHaveBeenCalledWith('agent');
			expect(plugin.updateSettings).not.toHaveBeenCalled();
		});

		it('reactivates the conversation agent quietly in agent mode', async () => {
			const { controller, settings, input, header } = makeHarness(makeSettings({ agents: [researcher, writer], activeAgentId: 'writer' }), 'agent');

			await controller.applyConversation(makeConversation({ agentId: 'researcher' }));

			expect(settings.activeAgentId).toBe('researcher');
			expect(settings.activeSystemPromptId).toBe('research-prompt');
			expect(input.agentSelector.value).toBe('researcher');
			expect(header.updateAgentBadge).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Researcher' }));
			expect(Notice).not.toHaveBeenCalled();
		});

		it('falls back to the default agent when the conversation agent was deleted', async () => {
			const { controller, settings, input } = makeHarness(makeSettings({ agents: [researcher, generalist] }), 'agent');

			await controller.applyConversation(makeConversation({ agentId: 'deleted-agent' }));

			expect(settings.activeAgentId).toBe(DEFAULT_AGENT_ID);
			expect(input.agentSelector.value).toBe(DEFAULT_AGENT_ID);
		});

		it('restores the model, prompt, sampling and toggles stored with a chat-mode conversation', async () => {
			const { controller, state, settings, input } = makeHarness(makeSettings({ agents: [researcher], activeAgentId: 'researcher' }), 'chat');

			await controller.applyConversation(makeConversation({
				modelId: 'vision-model',
				promptId: 'concise',
				temperature: 0.1,
				maxTokens: 900,
				topP: 0.5,
				frequencyPenalty: 0.3,
				presencePenalty: 0.4,
				ragEnabled: true,
				webSearchEnabled: true,
			}));

			expect(settings.activeAgentId).toBeNull();
			expect(settings.activeSystemPromptId).toBe('concise');
			expect(input.agentSelector.value).toBe('');
			expect(input.refreshAgentSelect).toHaveBeenCalledWith();
			expect(input.modelSelect.value).toBe('vision-model');
			expect(state.temperature).toBe(0.1);
			expect(state.maxTokens).toBe(900);
			expect(state.topP).toBe(0.5);
			expect(state.frequencyPenalty).toBe(0.3);
			expect(state.presencePenalty).toBe(0.4);
			expect(state.enableRAG).toBe(true);
			expect(state.enableWebSearch).toBe(true);
		});

		it('drops a stored system prompt that has since been disabled', async () => {
			const { controller, settings } = makeHarness(makeSettings({ activeSystemPromptId: 'concise' }), 'chat');

			await controller.applyConversation(makeConversation({ promptId: 'retired' }));

			expect(settings.activeSystemPromptId).toBeNull();
		});

		it('keeps the current model when the stored model is no longer offered', async () => {
			const { controller, input } = makeHarness(makeSettings(), 'chat');
			input.modelSelect.value = 'gpt-4o';

			await controller.applyConversation(makeConversation({ modelId: 'removed-model' }));

			expect(input.modelSelect.value).toBe('gpt-4o');
		});
	});

	describe('starting a new chat', () => {
		it('opens a plain chat with default sampling, the default model and tools off', async () => {
			const { controller, state, settings, input, header } = makeHarness(
				makeSettings({ agents: [researcher], activeAgentId: 'researcher', activeSystemPromptId: 'concise', defaultModel: 'claude-sonnet' }),
				'agent',
			);
			state.temperature = 1.5;
			state.topP = 0.2;
			state.enableRAG = true;
			state.enableWebSearch = true;

			await controller.startNewChat();

			expect(state.mode).toBe('chat');
			expect(settings.activeAgentId).toBeNull();
			expect(settings.activeSystemPromptId).toBeNull();
			expect(input.modelSelect.value).toBe('claude-sonnet');
			expect(input.agentSelector.value).toBe('');
			expect(header.updateAgentBadge).toHaveBeenLastCalledWith(null);
			expect(state.temperature).toBe(DEFAULT_CHAT_SAMPLING.temperature);
			expect(state.topP).toBe(DEFAULT_CHAT_SAMPLING.topP);
			expect(state.maxTokens).toBe(DEFAULT_CHAT_SAMPLING.maxTokens);
			expect(state.enableRAG).toBe(false);
			expect(state.enableWebSearch).toBe(false);
		});

		it('leaves the model unselected when no default model is configured', async () => {
			const { controller, input } = makeHarness(makeSettings({ defaultModel: '' }));
			input.modelSelect.value = 'gpt-4o';

			await controller.startNewChat();

			expect(input.modelSelect.value).toBe('');
		});

		it('opens with the default agent quietly when agent mode is the default', async () => {
			const { controller, state, settings, input, header } = makeHarness(makeSettings({ agents: [researcher, generalist], defaultChatMode: 'agent' }), 'chat');

			await controller.startNewChat();

			expect(state.mode).toBe('agent');
			expect(settings.activeAgentId).toBe(DEFAULT_AGENT_ID);
			expect(input.agentSelector.value).toBe(DEFAULT_AGENT_ID);
			expect(header.updateAgentBadge).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Generalist' }));
			expect(Notice).not.toHaveBeenCalled();
		});
	});

	describe('RAG and web search toggles', () => {
		it('turns RAG on in chat mode and shows the toggle as on', async () => {
			const { controller, state, input, refreshRagStatus } = makeHarness(makeSettings());

			await controller.toggleRag();

			expect(state.enableRAG).toBe(true);
			expect(input.updateActionToggleState).toHaveBeenCalledWith(input.ragActionItem, true, true, t('chat.agentSummary.on'));
			expect(refreshRagStatus).toHaveBeenCalledTimes(1);
		});

		it('turns web search off again on a second toggle', async () => {
			const { controller, state, input } = makeHarness(makeSettings());

			await controller.toggleWebSearch();
			await controller.toggleWebSearch();

			expect(state.enableWebSearch).toBe(false);
			expect(input.updateActionToggleState).toHaveBeenLastCalledWith(input.webActionItem, true, false, t('chat.agentSummary.off'));
		});

		it('ignores the toggles in agent mode, where the agent decides', async () => {
			const { controller, state, input } = makeHarness(makeSettings(), 'agent');

			await controller.toggleRag();
			await controller.toggleWebSearch();

			expect(state.enableRAG).toBe(false);
			expect(state.enableWebSearch).toBe(false);
			expect(input.updateActionToggleState).not.toHaveBeenCalled();
		});

		it('explains that RAG is disabled in settings instead of toggling it', async () => {
			const base = makeSettings();
			const { controller, state } = makeHarness(makeSettings({ ragConfig: { ...base.ragConfig, enabled: false } }));

			await controller.toggleRag();

			expect(state.enableRAG).toBe(false);
			expect(Notice).toHaveBeenCalledWith(t('chat.notices.ragDisabled'));
		});

		it('explains that web search is disabled in settings instead of toggling it', async () => {
			const base = makeSettings();
			const { controller, state } = makeHarness(makeSettings({ webSearchConfig: { ...base.webSearchConfig, enabled: false } }));

			await controller.toggleWebSearch();

			expect(state.enableWebSearch).toBe(false);
			expect(Notice).toHaveBeenCalledWith(t('chat.notices.webSearchDisabled'));
		});

		it('labels the toggles as disabled when the features are off in settings', async () => {
			const base = makeSettings();
			const { controller, input } = makeHarness(makeSettings({
				ragConfig: { ...base.ragConfig, enabled: false },
				webSearchConfig: { ...base.webSearchConfig, enabled: false },
			}));

			await controller.refreshOptions();

			expect(input.updateActionToggleState).toHaveBeenCalledWith(input.ragActionItem, false, false, t('chat.status.disabled'));
			expect(input.updateActionToggleState).toHaveBeenCalledWith(input.webActionItem, false, false, t('chat.status.disabled'));
		});

		it('skips toggles that are not rendered', async () => {
			const { controller, input } = makeHarness(makeSettings());
			input.ragActionItem = null;
			input.webActionItem = null;

			await controller.refreshOptions();

			expect(input.updateActionToggleState).not.toHaveBeenCalled();
		});
	});

	describe('whether RAG and web search are in effect', () => {
		it('follows the active agent in agent mode', () => {
			const { controller, state } = makeHarness(makeSettings({ agents: [researcher], activeAgentId: 'researcher' }), 'agent');
			state.enableRAG = false;
			state.enableWebSearch = false;

			expect(controller.activeAgent()?.id).toBe('researcher');
			expect(controller.ragActive()).toBe(true);
			expect(controller.webSearchActive()).toBe(true);
		});

		it('follows the chat toggles in chat mode', () => {
			const { controller, state } = makeHarness(makeSettings({ agents: [researcher], activeAgentId: 'researcher' }), 'chat');
			state.enableRAG = true;
			state.enableWebSearch = false;

			expect(controller.ragActive()).toBe(true);
			expect(controller.webSearchActive()).toBe(false);
		});

		it('is off whenever the feature is disabled in settings', () => {
			const base = makeSettings();
			const { controller, state } = makeHarness(makeSettings({
				ragConfig: { ...base.ragConfig, enabled: false },
				webSearchConfig: { ...base.webSearchConfig, enabled: false },
			}), 'chat');
			state.enableRAG = true;
			state.enableWebSearch = true;

			expect(controller.ragActive()).toBe(false);
			expect(controller.webSearchActive()).toBe(false);
		});

		it('is off in agent mode when no agent is active', () => {
			const { controller } = makeHarness(makeSettings({ agents: [researcher] }), 'agent');

			expect(controller.activeAgent()).toBeNull();
			expect(controller.ragActive()).toBe(false);
			expect(controller.webSearchActive()).toBe(false);
		});
	});

	describe('capability summary', () => {
		it('describes the active agent, its tools and the referenced files and folders', () => {
			const { controller } = makeHarness(makeSettings({ agents: [researcher], activeAgentId: 'researcher' }), 'agent');
			const resolveForAgent = jest.fn((_access: Agent['toolAccess']): RegisteredTool[] => []);
			const registry = { resolveForAgent } as unknown as ToolRegistry;

			const summary = controller.capabilitySummary(registry, [makeFile('notes/plan.md'), makeFolder('projects')]);

			expect(resolveForAgent).toHaveBeenCalledWith(researcher.toolAccess);
			expect(summary.agentName).toBe('Researcher');
			expect(summary.ragActive).toBe(true);
			expect(summary.webSearchActive).toBe(true);
			expect(summary.references).toEqual([
				{ type: 'file', path: 'notes/plan.md', name: 'plan.md' },
				{ type: 'folder', path: 'projects', name: 'projects' },
			]);
		});

		it('describes chat mode without consulting agent tools', () => {
			const { controller } = makeHarness(makeSettings(), 'chat');
			const resolveForAgent = jest.fn((_access: Agent['toolAccess']): RegisteredTool[] => []);
			const registry = { resolveForAgent } as unknown as ToolRegistry;

			const summary = controller.capabilitySummary(registry, []);

			expect(resolveForAgent).not.toHaveBeenCalled();
			expect(summary.mode).toBe('chat');
			expect(summary.toolCount).toBe(0);
			expect(summary.references).toEqual([]);
		});
	});

	describe('image attach button', () => {
		it('is shown when the selected model supports vision', async () => {
			const { controller, input } = makeHarness(makeSettings());
			jest.spyOn(ModelManager, 'getAllAvailableModels').mockResolvedValue([makeModel('vision-model', ['chat', 'vision'])]);
			input.modelSelect.value = 'vision-model';

			await controller.refreshImageButton();

			expect(input.setImageButtonVisible).toHaveBeenLastCalledWith(true);
		});

		it('is hidden when the selected model cannot see images', async () => {
			const { controller, input } = makeHarness(makeSettings());
			jest.spyOn(ModelManager, 'getAllAvailableModels').mockResolvedValue([makeModel('gpt-4o', ['chat'])]);
			input.modelSelect.value = 'gpt-4o';

			await controller.refreshImageButton();

			expect(input.setImageButtonVisible).toHaveBeenLastCalledWith(false);
		});

		it('is hidden without looking up models when no model is selected', async () => {
			const { controller, input } = makeHarness(makeSettings());
			const lookup = jest.spyOn(ModelManager, 'getAllAvailableModels');
			input.modelSelect.value = '';

			await controller.refreshImageButton();

			expect(input.setImageButtonVisible).toHaveBeenLastCalledWith(false);
			expect(lookup).not.toHaveBeenCalled();
		});
	});

	describe('selecting a model', () => {
		it('selects a model that the picker offers', () => {
			const { controller, input } = makeHarness(makeSettings());

			controller.selectModel('claude-sonnet');

			expect(input.modelSelect.value).toBe('claude-sonnet');
		});

		it('ignores a model the picker does not offer or an empty id', () => {
			const { controller, input } = makeHarness(makeSettings());
			input.modelSelect.value = 'gpt-4o';

			controller.selectModel('unknown-model');
			controller.selectModel(undefined);

			expect(input.modelSelect.value).toBe('gpt-4o');
		});
	});
});
