/**
 * Test suite for Agent Model
 */

import { AgentModel } from '../../domain/agent/agent.model';
import { createTestAgent } from '../../test-support/test-utils';

describe('AgentModel', () => {
	describe('constructor and getters', () => {
		it('should create agent model from data', () => {
			const agentData = createTestAgent({
				name: 'Test Agent',
				enabledBuiltInTools: ['tool1']
			});

			const agent = new AgentModel(agentData);

			expect(agent.toJSON()).toEqual(agentData);
		});
	});

	describe('canUseTooling', () => {
		it('should return true when tools are enabled', () => {
			const agent = new AgentModel(
				createTestAgent({ enabledBuiltInTools: ['tool1', 'tool2'] })
			);

			expect(agent.canUseTooling()).toBe(true);
		});

		it('should return false when tools are disabled', () => {
			const agent = new AgentModel(
				createTestAgent({ enabledBuiltInTools: [], enabledMcpServers: [] })
			);

			expect(agent.canUseTooling()).toBe(false);
		});
	});

	describe('isRAGEnabled', () => {
		it('should return true when RAG is enabled', () => {
			const agent = new AgentModel(
				createTestAgent({ ragEnabled: true })
			);

			expect(agent.isRAGEnabled()).toBe(true);
		});

		it('should return false when RAG is disabled', () => {
			const agent = new AgentModel(
				createTestAgent({ ragEnabled: false })
			);

			expect(agent.isRAGEnabled()).toBe(false);
		});
	});

	describe('getCapabilities', () => {
		it('should list all enabled capabilities', () => {
			const agent = new AgentModel(
				createTestAgent({
					enabledBuiltInTools: ['tool1'],
					ragEnabled: true,
					webSearchEnabled: true,
					reactEnabled: true
				})
			);

			const capabilities = agent.getCapabilities();

			expect(capabilities).toContain('Tools');
			expect(capabilities).toContain('RAG');
			expect(capabilities).toContain('Web Search');
			expect(capabilities).toContain('ReAct');
		});

		it('should return empty array when no capabilities enabled', () => {
			const agent = new AgentModel(
				createTestAgent({
					enabledBuiltInTools: [],
					enabledMcpServers: [],
					ragEnabled: false,
					webSearchEnabled: false,
					reactEnabled: false
				})
			);

			const capabilities = agent.getCapabilities();

			expect(capabilities).toHaveLength(0);
		});
	});

	describe('hasCapability', () => {
		it('should detect specific capabilities', () => {
			const agent = new AgentModel(
				createTestAgent({
					enabledBuiltInTools: ['tool1'],
					ragEnabled: false
				})
			);

			expect(agent.hasCapability('Tools')).toBe(true);
			expect(agent.hasCapability('RAG')).toBe(false);
		});
	});

	describe('validate', () => {
		it('should validate valid agent', () => {
			const agent = new AgentModel(createTestAgent());
			const result = agent.validate();

			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it('should detect missing required fields', () => {
			const agent = new AgentModel({
				...createTestAgent({ name: '', systemPromptId: '' }),
				modelStrategy: { strategy: null as any, modelId: '' }
			});

			const result = agent.validate();

			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Agent name is required');
			expect(result.errors).toContain('Model strategy is required');
			expect(result.errors).toContain('System prompt is required');
		});

		it('should detect missing fixed model ID when strategy is fixed', () => {
			const agent = new AgentModel({
				...createTestAgent(),
				modelStrategy: { strategy: 'fixed', modelId: '' }
			});

			const result = agent.validate();

			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Fixed model ID is required when using fixed model strategy');
		});

		it('should detect invalid temperature', () => {
			const agent = new AgentModel(
				createTestAgent({ temperature: 3.0 })
			);

			const result = agent.validate();

			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Temperature must be between 0 and 2');
		});

		it('should detect invalid max tokens', () => {
			const agent = new AgentModel(
				createTestAgent({ maxTokens: -1 })
			);

			const result = agent.validate();

			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Max tokens must be positive');
		});

		it('should detect invalid context window', () => {
			const agent = new AgentModel(
				createTestAgent({ contextWindow: -1 })
			);

			const result = agent.validate();

			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Context window must be positive');
		});
	});

	describe('getSummary', () => {
		it('should return agent summary', () => {
			const agent = new AgentModel(
				createTestAgent({
					name: 'Test Agent',
					icon: '🤖',
					modelId: 'gpt-4',
					enabledBuiltInTools: ['tool1', 'tool2']
				})
			);

			const summary = agent.getSummary();

			expect(summary.name).toBe('Test Agent');
			expect(summary.icon).toBe('🤖');
			expect(summary.model).toBe('test-model');
			expect(summary.capabilities).toContain('Tools');
			expect(summary.toolsCount).toBe(2);
		});
	});

	describe('clone', () => {
		it('should create a deep copy', () => {
			const original = new AgentModel(
				createTestAgent({
					name: 'Original',
					enabledBuiltInTools: ['tool1', 'tool2']
				})
			);

			const cloned = original.clone();
			cloned.update({ name: 'Cloned' });

			expect(original.toJSON().name).toBe('Original');
			expect(cloned.toJSON().name).toBe('Cloned');
		});
	});

	describe('fromJSON', () => {
		it('should create agent model from JSON', () => {
			const agentData = createTestAgent({ name: 'Test' });
			const agent = AgentModel.fromJSON(agentData);

			expect(agent).toBeInstanceOf(AgentModel);
			expect(agent.toJSON().name).toBe('Test');
		});
	});
});
