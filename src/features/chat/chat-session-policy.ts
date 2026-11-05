import { DEFAULT_AGENT_ID, DEFAULT_CHAT_SAMPLING } from '@/core/constants';
import type { Agent, SystemPrompt } from '@/features/agent';
import type { ConversationConfig } from '@/features/conversations';

export type ChatMode = 'chat' | 'agent';

export interface SessionSettings {
	agents: Agent[];
	activeAgentId?: string | null;
	systemPrompts: Array<Pick<SystemPrompt, 'id' | 'enabled'>>;
	activeSystemPromptId?: string | null;
}

export interface SessionSelection {
	activeAgentId: string | null;
	activeSystemPromptId: string | null;
}

export function pickAgentId(settings: Pick<SessionSettings, 'agents' | 'activeAgentId'>): string | null {
	const { agents, activeAgentId } = settings;
	if (activeAgentId && agents.some(agent => agent.id === activeAgentId)) {
		return activeAgentId;
	}
	return (agents.find(agent => agent.id === DEFAULT_AGENT_ID) ?? agents[0])?.id ?? null;
}

export function activeAgent(settings: Pick<SessionSettings, 'agents' | 'activeAgentId'>): Agent | null {
	const { agents, activeAgentId } = settings;
	return activeAgentId ? agents.find(agent => agent.id === activeAgentId) ?? null : null;
}

export function agentModelId(agent: Agent, selectedModel: string, defaultModel: string): string {
	switch (agent.modelStrategy?.strategy) {
		case 'chat-view':
			return selectedModel || defaultModel;
		case 'default':
			return defaultModel;
		default:
			return agent.modelStrategy?.modelId || defaultModel;
	}
}

export function selectionForConversation(settings: SessionSettings, mode: ChatMode, config: ConversationConfig): SessionSelection {
	if (mode === 'agent') {
		const requested = config.agentId && settings.agents.some(agent => agent.id === config.agentId) ? config.agentId : null;
		const agentId = requested ?? pickAgentId(settings);
		const agent = settings.agents.find(candidate => candidate.id === agentId);
		return {
			activeAgentId: agentId,
			activeSystemPromptId: agent?.systemPromptId || (settings.activeSystemPromptId ?? null),
		};
	}
	const enabled = settings.systemPrompts.some(prompt => prompt.enabled && prompt.id === config.promptId);
	return { activeAgentId: null, activeSystemPromptId: enabled ? config.promptId ?? null : null };
}

export function selectionForNewChat(settings: SessionSettings, mode: ChatMode): SessionSelection {
	return {
		activeAgentId: mode === 'agent' ? pickAgentId(settings) : null,
		activeSystemPromptId: null,
	};
}

export function openingSession(settings: Pick<SessionSettings, 'agents' | 'activeAgentId'>, defaultMode: ChatMode | undefined): { mode: ChatMode; activeAgentId: string | null } {
	const agentId = defaultMode === 'agent' ? pickAgentId(settings) : null;
	return agentId
		? { mode: 'agent', activeAgentId: agentId }
		: { mode: 'chat', activeAgentId: settings.activeAgentId ?? null };
}

/** Snapshot the selected Agent's effective values; Chat defaults must not overwrite them. */
export function newConversationConfig(settings: SessionSettings & { defaultModel?: string }, mode: ChatMode, selectedModel = ''): ConversationConfig {
	const modelId = settings.defaultModel || selectedModel || undefined;
	const defaults: ConversationConfig = { promptId: null, agentId: null, ...DEFAULT_CHAT_SAMPLING, ragEnabled: false, webSearchEnabled: false, modelId };
	if (mode !== 'agent') return defaults;
	const agentId = pickAgentId(settings);
	const agent = settings.agents.find(candidate => candidate.id === agentId);
	if (!agent) return defaults;
	return { ...defaults, agentId: agent.id, promptId: agent.systemPromptId ?? null,
		modelId: agentModelId(agent, selectedModel, settings.defaultModel ?? '') || undefined,
		temperature: agent.temperature, maxTokens: agent.maxTokens,
		ragEnabled: agent.ragEnabled, webSearchEnabled: agent.webSearchEnabled };
}
