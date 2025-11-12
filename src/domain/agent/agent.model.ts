/**
 * Agent Domain Model
 * Encapsulates agent business logic and rules
 */

import type { Agent, SystemPrompt, ModelInfo } from '@/types';

export class AgentModel {
	constructor(private data: Agent) {}

	/**
	 * Check if agent can use tooling
	 */
	canUseTooling(): boolean {
		return (
			this.data.enabledBuiltInTools.length > 0 ||
			this.data.enabledMcpServers.length > 0
		);
	}

	/**
	 * Check if RAG is enabled and configured
	 */
	isRAGEnabled(): boolean {
		return this.data.ragEnabled;
	}

	/**
	 * Check if web search is enabled
	 */
	isWebSearchEnabled(): boolean {
		return this.data.webSearchEnabled;
	}

	/**
	 * Check if ReAct mode is enabled
	 */
	isReActEnabled(): boolean {
		return this.data.reactEnabled;
	}

	/**
	 * Get agent capabilities
	 */
	getCapabilities(): string[] {
		const capabilities: string[] = [];

		if (this.isRAGEnabled()) capabilities.push('RAG');
		if (this.isWebSearchEnabled()) capabilities.push('Web Search');
		if (this.isReActEnabled()) capabilities.push('ReAct');
		if (this.canUseTooling()) capabilities.push('Tools');

		return capabilities;
	}

	/**
	 * Check if agent has specific capability
	 */
	hasCapability(capability: string): boolean {
		return this.getCapabilities().includes(capability);
	}

	/**
	 * Get enabled tools count
	 */
	getToolsCount(): number {
		return this.data.enabledBuiltInTools.length + this.data.enabledMcpServers.length;
	}

	/**
	 * Check if agent uses short-term memory
	 */
	usesShortTermMemory(): boolean {
		return this.data.memoryType === 'short-term';
	}

	/**
	 * Check if agent uses long-term memory
	 */
	usesLongTermMemory(): boolean {
		return this.data.memoryType === 'long-term';
	}

	/**
	 * Check if memory is enabled
	 */
	hasMemory(): boolean {
		return this.data.memoryType !== 'none';
	}

	/**
	 * Get memory configuration
	 */
	getMemoryConfig() {
		return {
			type: this.data.memoryType,
			summaryInterval: this.data.memoryConfig.summaryInterval,
			maxMemories: this.data.memoryConfig.maxMemories
		};
	}

	/**
	 * Validate agent configuration
	 */
	validate(): { valid: boolean; errors: string[] } {
		const errors: string[] = [];

		if (!this.data.name || this.data.name.trim() === '') {
			errors.push('Agent name is required');
		}

		if (!this.data.modelStrategy || !this.data.modelStrategy.strategy) {
			errors.push('Model strategy is required');
		} else if (this.data.modelStrategy.strategy === 'fixed' && (!this.data.modelStrategy.modelId || this.data.modelStrategy.modelId.trim() === '')) {
			errors.push('Fixed model ID is required when using fixed model strategy');
		}

		if (!this.data.systemPromptId || this.data.systemPromptId.trim() === '') {
			errors.push('System prompt is required');
		}

		if (this.data.temperature < 0 || this.data.temperature > 2) {
			errors.push('Temperature must be between 0 and 2');
		}

		if (this.data.maxTokens <= 0) {
			errors.push('Max tokens must be positive');
		}

		if (this.data.contextWindow <= 0) {
			errors.push('Context window must be positive');
		}

		return {
			valid: errors.length === 0,
			errors
		};
	}

	/**
	 * Get agent summary for display
	 */
	getSummary(): {
		name: string;
		icon: string;
		model: string;
		capabilities: string[];
		toolsCount: number;
	} {
		// Determine the model display name based on strategy
		let modelDisplay: string;
		if (this.data.modelStrategy.strategy === 'fixed' && this.data.modelStrategy.modelId) {
			modelDisplay = this.data.modelStrategy.modelId;
		} else if (this.data.modelStrategy.strategy === 'chat-view') {
			modelDisplay = 'Use Chat View Model';
		} else if (this.data.modelStrategy.strategy === 'default') {
			modelDisplay = 'Use Default Model';
		} else {
			modelDisplay = 'Unknown Model';
		}

		return {
			name: this.data.name,
			icon: this.data.icon,
			model: modelDisplay,
			capabilities: this.getCapabilities(),
			toolsCount: this.getToolsCount()
		};
	}

	/**
	 * Clone agent data
	 */
	clone(): AgentModel {
		return new AgentModel(JSON.parse(JSON.stringify(this.data)));
	}

	/**
	 * Update agent data
	 */
	update(updates: Partial<Agent>): void {
		Object.assign(this.data, updates);
		this.data.updatedAt = Date.now();
	}

	/**
	 * Export to plain object
	 */
	toJSON(): Agent {
		return { ...this.data };
	}

	/**
	 * Get raw data
	 */
	getData(): Agent {
		return this.data;
	}

	/**
	 * Create from plain object
	 */
	static fromJSON(data: Agent): AgentModel {
		return new AgentModel(data);
	}
}
