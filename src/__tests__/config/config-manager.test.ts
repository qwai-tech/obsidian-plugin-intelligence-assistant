/**
 * Test suite for Config Manager
 */

import { ConfigManager } from '../../core/config-manager';
import { DEFAULT_SETTINGS } from '@/types';
import { createMockApp, createTestSettings, createTestAgent, createTestLLMConfig } from '../../test-support/test-utils';

describe('ConfigManager', () => {
	let configManager: ConfigManager;
	let saveCallback: jest.Mock;

	beforeEach(() => {
		saveCallback = jest.fn().mockResolvedValue(undefined);
		configManager = new ConfigManager(
			createMockApp(),
			createTestSettings(),
			saveCallback
		);
	});

	describe('get and set', () => {
		it('should get setting value', () => {
			const agents = configManager.get('agents');
			expect(agents).toBeDefined();
		});

		it('should set setting value', async () => {
			const newAgents = [createTestAgent()];
			await configManager.set('agents', newAgents);

			expect(configManager.get('agents')).toEqual(newAgents);
			expect(saveCallback).toHaveBeenCalled();
		});

		it('should validate before setting', async () => {
			const invalidAgent = createTestAgent({ id: '' });

			await expect(
				configManager.set('agents', [invalidAgent])
			).rejects.toThrow('Validation failed');

			expect(saveCallback).not.toHaveBeenCalled();
		});

		it('should allow setting without validation', async () => {
			const invalidAgent = createTestAgent({ id: '' });

			await configManager.set('agents', [invalidAgent], false);

			expect(configManager.get('agents')).toEqual([invalidAgent]);
			expect(saveCallback).toHaveBeenCalled();
		});
	});

	describe('getPath and setPath', () => {
		it('should get nested value using dot notation', () => {
			const settings = createTestSettings({
				ragConfig: {
					...DEFAULT_SETTINGS.ragConfig,
					chunkSize: 1000
				}
			});

			configManager = new ConfigManager(createMockApp(), settings, saveCallback);

			expect(configManager.getPath('ragConfig.chunkSize')).toBe(1000);
		});

		it('should set nested value using dot notation', async () => {
			await configManager.setPath('ragConfig.chunkSize', 2000);

			expect(configManager.getPath('ragConfig.chunkSize')).toBe(2000);
			expect(saveCallback).toHaveBeenCalled();
		});

		it('should handle array indices in path', async () => {
			const agents = [createTestAgent({ name: 'Agent 1' })];
			await configManager.set('agents', agents, false);

			expect(configManager.getPath('agents[0].name')).toBe('Agent 1');

			await configManager.setPath('agents[0].name', 'Updated Agent', false);
			expect(configManager.getPath('agents[0].name')).toBe('Updated Agent');
		});

		it('should throw error for invalid path', async () => {
			await expect(
				configManager.setPath('invalid.path.that.does.not.exist', 'value')
			).rejects.toThrow('Invalid configuration path');
		});
	});

	describe('update', () => {
		it('should update multiple settings at once', async () => {
			const partial = {
				agents: [createTestAgent()],
				conversations: []
			};

			await configManager.update(partial, false);

			expect(configManager.get('agents')).toEqual(partial.agents);
			expect(configManager.get('conversations')).toEqual([]);
			expect(saveCallback).toHaveBeenCalled();
		});

		it('should validate partial update', async () => {
			const invalidPartial = {
				agents: [createTestAgent({ id: '' })]
			};

			await expect(
				configManager.update(invalidPartial)
			).rejects.toThrow('Validation failed');
		});
	});

	describe('validate', () => {
		it('should validate current settings', () => {
			const result = configManager.validate();

			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});
	});

	describe('reset', () => {
		it('should reset all settings to defaults', async () => {
			await configManager.set('agents', [createTestAgent()], false);
			await configManager.reset(false);

			expect(configManager.get('agents')).toEqual(DEFAULT_SETTINGS.agents);
			expect(saveCallback).toHaveBeenCalled();
		});

		it('should reset specific section', async () => {
			const customAgents = [createTestAgent()];
			await configManager.set('agents', customAgents, false);

			await configManager.resetSection('agents');

			expect(configManager.get('agents')).toEqual(DEFAULT_SETTINGS.agents);
		});
	});

	describe('export and import', () => {
		it('should export settings as JSON', () => {
			const json = configManager.export();
			const parsed = JSON.parse(json);

			expect(parsed).toHaveProperty('agents');
			expect(parsed).toHaveProperty('llmConfigs');
		});

		it('should import settings from JSON', async () => {
			const settings = createTestSettings({
				agents: [createTestAgent({ name: 'Imported Agent' })]
			});

			const json = JSON.stringify(settings);
			await configManager.import(json, false);

			expect(configManager.get('agents')[0].name).toBe('Imported Agent');
		});

		it('should reject invalid JSON', async () => {
			await expect(
				configManager.import('not valid json')
			).rejects.toThrow('Invalid JSON format');
		});

		it('should validate imported settings', async () => {
			const invalidSettings = createTestSettings({
				agents: [createTestAgent({ id: '' })]
			});

			const json = JSON.stringify(invalidSettings);

			await expect(
				configManager.import(json, true)
			).rejects.toThrow('Imported settings validation failed');
		});
	});

	describe('change history', () => {
		it('should record configuration changes', async () => {
			await configManager.set('agents', [createTestAgent()], false);

			const history = configManager.getChangeHistory();

			expect(history.length).toBeGreaterThan(0);
			expect(history[0]).toHaveProperty('path');
			expect(history[0]).toHaveProperty('timestamp');
		});

		it('should limit history size', async () => {
			// Make many changes
			for (let i = 0; i < 150; i++) {
				await configManager.setPath('ragConfig.chunkSize', 1000 + i, false);
			}

			const history = configManager.getChangeHistory();
			expect(history.length).toBeLessThanOrEqual(100);
		});

		it('should clear history', async () => {
			await configManager.set('agents', [createTestAgent()], false);
			configManager.clearHistory();

			const history = configManager.getChangeHistory();
			expect(history).toHaveLength(0);
		});
	});

	describe('getStats', () => {
		it('should return configuration statistics', async () => {
			const settings = createTestSettings({
				agents: [createTestAgent(), createTestAgent()],
				llmConfigs: [
					createTestLLMConfig({ provider: 'provider1', baseUrl: 'http://test' })
				]
			});

			configManager = new ConfigManager(createMockApp(), settings, saveCallback);

			const stats = configManager.getStats();

			expect(stats.agents).toBe(2);
			expect(stats.llmProviders).toBe(1);
			expect(stats).toHaveProperty('version');
		});
	});
});
