/**
 * Agent Domain Model
 * Encapsulates agent business logic and rules
 */

import type { Agent } from '@/types';

export class AgentModel {
	constructor(private readonly _data: Agent) {}

	/**
	 * Check if agent can use tooling
	 */
	canUseTooling(): boolean {
		return (
			this._data.enabledBuiltInTools.length > 0 ||
			this._data.enabledMcpServers.length > 0
		);
	}

	/**
	 * Check if RAG is enabled and configured
	 */
	isRAGEnabled(): boolean {
		return this._data.ragEnabled;
	}

	/**
	 * Check if web search is enabled
	 */
	isWebSearchEnabled(): boolean {
		return this._data.webSearchEnabled;
	}

	/**
	 * Check if ReAct mode is enabled
	 */
	isReActEnabled(): boolean {
		return this._data.reactEnabled;
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
		return this._data.enabledBuiltInTools.length + this._data.enabledMcpServers.length;
	}

	/**
	 * Check if agent uses short-term memory
	 */
	usesShortTermMemory(): boolean {
		return this._data.memoryType === 'short-term';
	}

	/**
	 * Check if agent uses long-term memory
	 */
	usesLongTermMemory(): boolean {
		return this._data.memoryType === 'long-term';
	}

	/**
	 * Check if memory is enabled
	 */
	hasMemory(): boolean {
		return this._data.memoryType !== 'none';
	}

	/**
	 * Get memory configuration
	 */
	getMemoryConfig() {
		return {
			type: this._data.memoryType,
			summaryInterval: this._data.memoryConfig.summaryInterval,
			maxMemories: this._data.memoryConfig.maxMemories
		};
	}

	/**
	 * Validate agent configuration
	 */
	validate(): { valid: boolean; errors: string[] } {
		const errors: string[] = [];

		if (!this._data.name || this._data.name.trim() === '') {
			errors.push('Agent name is required');
		}

		if (!this._data.modelStrategy || !this._data.modelStrategy.strategy) {
			errors.push('Model strategy is required');
		} else if (this._data.modelStrategy.strategy === 'fixed' && (!this._data.modelStrategy.modelId || this._data.modelStrategy.modelId.trim() === '')) {
			errors.push('Fixed model ID is required when using fixed model strategy');
		}

		if (!this._data.systemPromptId || this._data.systemPromptId.trim() === '') {
			errors.push('System prompt is required');
		}

		if (this._data.temperature < 0 || this._data.temperature > 2) {
			errors.push('Temperature must be between 0 and 2');
		}

		if (this._data.maxTokens <= 0) {
			errors.push('Max tokens must be positive');
		}

		if (this._data.contextWindow <= 0) {
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
		if (this._data.modelStrategy.strategy === 'fixed' && this._data.modelStrategy.modelId) {
			modelDisplay = this._data.modelStrategy.modelId;
		} else if (this._data.modelStrategy.strategy === 'chat-view') {
			modelDisplay = 'Use Chat View Model';
		} else if (this._data.modelStrategy.strategy === 'default') {
			modelDisplay = 'Use Default Model';
		} else {
			modelDisplay = 'Unknown Model';
		}

		return {
			name: this._data.name,
			icon: this._data.icon,
			model: modelDisplay,
			capabilities: this.getCapabilities(),
			toolsCount: this.getToolsCount()
		};
	}

	/**
	 * Clone agent data
	 */
	clone(): AgentModel {
		return new AgentModel(JSON.parse(JSON.stringify(this._data)) as Agent);
	}

	/**
	 * Update agent data
	 */
	update(updates: Partial<Agent>): void {
		Object.assign(this._data, updates);
		this._data.updatedAt = Date.now();
	}

	/**
	 * Export to plain object
	 */
	toJSON(): Agent {
		return { ...this._data };
	}

	/**
	 * Get raw data
	 */
	getData(): Agent {
		return this._data;
	}

	/**
	 * Create from plain object
	 */
	static fromJSON(data: Agent): AgentModel {
		return new AgentModel(data);
	}
}
