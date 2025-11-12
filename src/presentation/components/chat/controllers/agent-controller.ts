/**
 * Agent Controller
 * Manages agent selection and agent-related operations
 */

import { Notice } from 'obsidian';
import { BaseController } from './base-controller';
import type { Agent } from '@/types';
import { DEFAULT_AGENT_ID } from '@/constants';

export class AgentController extends BaseController {
	private currentAgentId: string | null = null;

	async initialize(): Promise<void> {
		// Load saved agent selection
		this.currentAgentId = this.plugin.settings.activeAgentId;

		// Ensure default agent exists
		if (!this.currentAgentId || !this.getAgent(this.currentAgentId)) {
			this.currentAgentId = this.ensureDefaultAgentSelection();
		}
	}

	cleanup(): void {
		this.currentAgentId = null;
	}

	/**
	 * Get current agent
	 */
	getCurrentAgent(): Agent | null {
		if (!this.currentAgentId) return null;
		return this.getAgent(this.currentAgentId);
	}

	/**
	 * Set current agent
	 */
	async setCurrentAgent(agentId: string): Promise<void> {
		const agent = this.getAgent(agentId);
		if (!agent) {
			new Notice('Agent not found');
			return;
		}

		this.currentAgentId = agentId;
		this.plugin.settings.activeAgentId = agentId;
		await this.plugin.saveSettings();

		// Emit state change
		this.state.trigger('agent-changed', { agentId });
	}

	/**
	 * Get agent by ID
	 */
	getAgent(agentId: string): Agent | null {
		return this.plugin.settings.agents.find(a => a.id === agentId) || null;
	}

	/**
	 * Get all agents
	 */
	getAllAgents(): Agent[] {
		return this.plugin.settings.agents;
	}

	/**
	 * Refresh agent selection, ensuring a valid agent is selected
	 */
	refreshAgentSelection(preferredAgentId?: string): string | null {
		const agents = this.getAllAgents();
		if (agents.length === 0) {
			return this.ensureDefaultAgentSelection();
		}

		// Try preferred agent
		if (preferredAgentId && this.getAgent(preferredAgentId)) {
			this.currentAgentId = preferredAgentId;
			return preferredAgentId;
		}

		// Try current agent
		if (this.currentAgentId && this.getAgent(this.currentAgentId)) {
			return this.currentAgentId;
		}

		// Try saved active agent
		const savedAgentId = this.plugin.settings.activeAgentId;
		if (savedAgentId && this.getAgent(savedAgentId)) {
			this.currentAgentId = savedAgentId;
			return savedAgentId;
		}

		// Fall back to first agent
		if (agents.length > 0) {
			this.currentAgentId = agents[0].id;
			return agents[0].id;
		}

		return this.ensureDefaultAgentSelection();
	}

	/**
	 * Ensure default agent exists and is selected
	 */
	private ensureDefaultAgentSelection(): string | null {
		const defaultAgent = this.getAgent(DEFAULT_AGENT_ID);
		if (defaultAgent) {
			this.currentAgentId = DEFAULT_AGENT_ID;
			return DEFAULT_AGENT_ID;
		}

		// Create default agent if it doesn't exist
		const agents = this.getAllAgents();
		if (agents.length > 0) {
			this.currentAgentId = agents[0].id;
			return agents[0].id;
		}

		return null;
	}

	/**
	 * Get the effective model ID for an agent based on its model strategy
	 */
	getAgentModelId(agent: Agent, chatViewInitiatedModel?: string): string {
		switch (agent.modelStrategy.strategy) {
			case 'fixed':
				return agent.modelStrategy.modelId || this.plugin.settings.defaultModel || '';
			case 'chat-view':
				return chatViewInitiatedModel || this.plugin.settings.defaultModel || '';
			case 'default':
				return this.plugin.settings.defaultModel || '';
			default:
				return this.plugin.settings.defaultModel || '';
		}
	}

	/**
	 * Get agent summary information
	 */
	getAgentSummary(agentId?: string, chatViewCurrentModel?: string): {
		name: string;
		icon: string;
		modelId: string;
		capabilities: string[];
	} | null {
		const agent = agentId ? this.getAgent(agentId) : this.getCurrentAgent();
		if (!agent) return null;

		const capabilities: string[] = [];
		if (agent.ragEnabled) capabilities.push('RAG');
		if (agent.webSearchEnabled) capabilities.push('Web Search');
		if (agent.reactEnabled) capabilities.push('ReAct');
		if (agent.enabledBuiltInTools.length > 0 || agent.enabledMcpServers.length > 0) {
			capabilities.push('Tools');
		}

		return {
			name: agent.name,
			icon: agent.icon,
			modelId: this.getAgentModelId(agent, chatViewCurrentModel),
			capabilities
		};
	}

	/**
	 * Check if agent has capability
	 */
	hasCapability(capability: 'rag' | 'webSearch' | 'react' | 'tools'): boolean {
		const agent = this.getCurrentAgent();
		if (!agent) return false;

		switch (capability) {
			case 'rag':
				return agent.ragEnabled;
			case 'webSearch':
				return agent.webSearchEnabled;
			case 'react':
				return agent.reactEnabled;
			case 'tools':
				return agent.enabledBuiltInTools.length > 0 || agent.enabledMcpServers.length > 0;
			default:
				return false;
		}
	}
}
