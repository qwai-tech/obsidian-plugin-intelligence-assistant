import { createTestAgent } from '@/test-support/test-utils';
import { DEFAULT_AGENT_ID } from '@/core/constants';
import {
	activeAgent,
	agentModelId,
	openingSession,
	pickAgentId,
	selectionForConversation,
	selectionForNewChat,
	type SessionSettings,
} from '@/features/chat/chat-session-policy';

const settings = (overrides: Partial<SessionSettings> = {}): SessionSettings => ({
	agents: [createTestAgent({ id: 'a1', systemPromptId: 'p-agent' }), createTestAgent({ id: DEFAULT_AGENT_ID })],
	activeAgentId: null,
	systemPrompts: [{ id: 'p1', enabled: true }, { id: 'p2', enabled: false }],
	activeSystemPromptId: null,
	...overrides,
});

describe('pickAgentId', () => {
	it('keeps the active agent when it exists', () => {
		expect(pickAgentId(settings({ activeAgentId: 'a1' }))).toBe('a1');
	});

	it('falls back to the default agent, then the first agent', () => {
		expect(pickAgentId(settings({ activeAgentId: 'gone' }))).toBe(DEFAULT_AGENT_ID);
		expect(pickAgentId(settings({ agents: [createTestAgent({ id: 'only' })] }))).toBe('only');
	});

	it('returns null without agents', () => {
		expect(pickAgentId(settings({ agents: [] }))).toBeNull();
	});
});

describe('agentModelId', () => {
	it('uses the fixed model, else the default', () => {
		expect(agentModelId(createTestAgent({ modelStrategy: { strategy: 'fixed', modelId: 'm-fixed' } }), 'm-view', 'm-default')).toBe('m-fixed');
		expect(agentModelId(createTestAgent({ modelStrategy: { strategy: 'fixed' } }), 'm-view', 'm-default')).toBe('m-default');
	});

	it('keeps the chat view model for the chat-view strategy', () => {
		expect(agentModelId(createTestAgent({ modelStrategy: { strategy: 'chat-view' } }), 'm-view', 'm-default')).toBe('m-view');
		expect(agentModelId(createTestAgent({ modelStrategy: { strategy: 'chat-view' } }), '', 'm-default')).toBe('m-default');
	});

	it('uses the default model for the default strategy', () => {
		expect(agentModelId(createTestAgent({ modelStrategy: { strategy: 'default', modelId: 'm-fixed' } }), 'm-view', 'm-default')).toBe('m-default');
	});
});

describe('selectionForConversation', () => {
	it('activates the conversation agent and its prompt in agent mode', () => {
		expect(selectionForConversation(settings(), 'agent', { agentId: 'a1' })).toEqual({ activeAgentId: 'a1', activeSystemPromptId: 'p-agent' });
	});

	it('replaces a missing conversation agent with the fallback agent', () => {
		expect(selectionForConversation(settings({ activeSystemPromptId: 'p1' }), 'agent', { agentId: 'gone' }).activeAgentId).toBe(DEFAULT_AGENT_ID);
	});

	it('restores an enabled prompt and clears the agent in chat mode', () => {
		expect(selectionForConversation(settings({ activeAgentId: 'a1' }), 'chat', { promptId: 'p1' })).toEqual({ activeAgentId: null, activeSystemPromptId: 'p1' });
	});

	it('drops a disabled or unknown prompt in chat mode', () => {
		expect(selectionForConversation(settings({ activeSystemPromptId: 'p1' }), 'chat', { promptId: 'p2' }).activeSystemPromptId).toBeNull();
	});
});

describe('selectionForNewChat', () => {
	it('starts agent mode on the fallback agent without a prompt', () => {
		expect(selectionForNewChat(settings({ activeSystemPromptId: 'p1' }), 'agent')).toEqual({ activeAgentId: DEFAULT_AGENT_ID, activeSystemPromptId: null });
	});

	it('starts chat mode with no agent and no prompt', () => {
		expect(selectionForNewChat(settings({ activeAgentId: 'a1', activeSystemPromptId: 'p1' }), 'chat')).toEqual({ activeAgentId: null, activeSystemPromptId: null });
	});
});

describe('openingSession', () => {
	it('opens in agent mode on the fallback agent when agent mode is the default', () => {
		expect(openingSession(settings({ activeAgentId: 'gone' }), 'agent')).toEqual({ mode: 'agent', activeAgentId: DEFAULT_AGENT_ID });
	});

	it('opens in chat mode when there is no agent to use', () => {
		expect(openingSession(settings({ agents: [] }), 'agent')).toEqual({ mode: 'chat', activeAgentId: null });
	});

	it('keeps the active agent untouched in chat mode', () => {
		expect(openingSession(settings({ activeAgentId: 'a1' }), 'chat')).toEqual({ mode: 'chat', activeAgentId: 'a1' });
	});
});

describe('activeAgent', () => {
	it('returns the agent whose id is active, and null when none is or it no longer exists', () => {
		const agents = [createTestAgent({ id: 'a' }), createTestAgent({ id: 'b' })];

		expect(activeAgent({ agents, activeAgentId: 'b' })).toBe(agents[1]);
		expect(activeAgent({ agents, activeAgentId: null })).toBeNull();
		expect(activeAgent({ agents, activeAgentId: 'gone' })).toBeNull();
	});
});
