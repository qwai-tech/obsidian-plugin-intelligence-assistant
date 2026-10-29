import { DEFAULT_AGENT_ID } from '@/core/constants';
import type { Agent, SystemPrompt } from '@/features/agent/types/agent';
import type { ConversationConfig } from '@/features/conversations/types/conversation';

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

export function agentModelId(agent: Agent, selectedModel: string, defaultModel: string): string {
	switch (agent.modelStrategy.strategy) {
		case 'chat-view':
			return selectedModel || defaultModel;
		case 'default':
			return defaultModel;
		default:
			return agent.modelStrategy.modelId || defaultModel;
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
