/**
 * Test suite for Config Schema
 */

import { ConfigSchema } from '../../core/config-schema';
import { DEFAULT_SETTINGS } from '@/types';
import { createTestSettings, createTestLLMConfig, createTestAgent } from '../../test-support/test-utils';

describe('ConfigSchema', () => {
	describe('validate', () => {
		it('should validate valid settings', () => {
			const settings = createTestSettings();
			const result = ConfigSchema.validate(settings);

			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it('should detect missing provider name', () => {
			const settings = createTestSettings({
				llmConfigs: [
					createTestLLMConfig({ provider: '' })
				]
			});

			const result = ConfigSchema.validate(settings);

			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					path: 'llmConfigs[0].provider',
					message: 'Provider name is required'
				})
			);
		});

		it('should detect invalid URL format', () => {
			const settings = createTestSettings({
				llmConfigs: [
					createTestLLMConfig({ baseUrl: 'not-a-url' })
				]
			});

			const result = ConfigSchema.validate(settings);

			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					path: 'llmConfigs[0].baseUrl',
					message: 'Invalid URL format'
				})
			);
		});

		it('should warn about missing API key for remote providers', () => {
			const settings = createTestSettings({
				llmConfigs: [
					createTestLLMConfig({
						apiKey: '',
						baseUrl: 'https://api.openai.com'
					})
				]
			});

			const result = ConfigSchema.validate(settings);

			expect(result.warnings).toContainEqual(
				expect.objectContaining({
					path: 'llmConfigs[0].apiKey',
					message: 'API key is recommended for remote providers'
				})
			);
		});

		it('should not warn about missing API key for localhost', () => {
			const settings = createTestSettings({
				llmConfigs: [
					createTestLLMConfig({
						apiKey: '',
						baseUrl: 'http://localhost:8000'
					})
				]
			});

			const result = ConfigSchema.validate(settings);

			const apiKeyWarnings = result.warnings.filter(w => w.path === 'llmConfigs[0].apiKey');
			expect(apiKeyWarnings).toHaveLength(0);
		});
	});

	describe('agent validation', () => {
		it('should validate agent configuration', () => {
			const settings = createTestSettings({
				agents: [createTestAgent()]
			});

			const result = ConfigSchema.validate(settings);

			expect(result.valid).toBe(true);
		});


		it('should detect invalid temperature', () => {
			const settings = createTestSettings({
				agents: [createTestAgent({ temperature: 3.0 })]
			});

			const result = ConfigSchema.validate(settings);

			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					path: 'agents[0].temperature',
					message: 'Temperature must be between 0 and 2'
				})
			);
		});

		it('should detect invalid max tokens', () => {
			const settings = createTestSettings({
				agents: [createTestAgent({ maxTokens: -1 })]
			});

			const result = ConfigSchema.validate(settings);

			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					path: 'agents[0].maxTokens',
					message: 'Max tokens must be positive'
				})
			);
		});
	});

	describe('RAG validation', () => {
		it('should validate RAG configuration', () => {
			const settings = createTestSettings({
				ragConfig: {
					...DEFAULT_SETTINGS.ragConfig,
					enabled: true,
					chunkSize: 1000,
					chunkOverlap: 200,
					topK: 5,
					similarityThreshold: 0.7
				}
			});

			const result = ConfigSchema.validate(settings);

			expect(result.valid).toBe(true);
		});

		it('should detect invalid chunk size', () => {
			const settings = createTestSettings({
				ragConfig: {
					...DEFAULT_SETTINGS.ragConfig,
					chunkSize: 0
				}
			});

			const result = ConfigSchema.validate(settings);

			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					path: 'ragConfig.chunkSize',
					message: 'RAG chunk size must be positive'
				})
			);
		});

		it('should detect invalid similarity threshold', () => {
			const settings = createTestSettings({
				ragConfig: {
					...DEFAULT_SETTINGS.ragConfig,
					similarityThreshold: 1.5
				}
			});

			const result = ConfigSchema.validate(settings);

			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					path: 'ragConfig.similarityThreshold',
					message: 'RAG similarity threshold must be between 0 and 1'
				})
			);
		});
	});

	describe('validateSection', () => {
		it('should validate specific section', () => {
			const llmConfigs = [createTestLLMConfig()];
			const result = ConfigSchema.validateSection('llmConfigs', llmConfigs);

			expect(result.valid).toBe(true);
		});

		it('should only return errors for specified section', () => {
			const llmConfigs = [createTestLLMConfig({ provider: '' })];
			const result = ConfigSchema.validateSection('llmConfigs', llmConfigs);

			expect(result.valid).toBe(false);
			expect(result.errors.every(e => e.path.startsWith('llmConfigs'))).toBe(true);
		});
	});

	describe('isRequired', () => {
		it('should identify required fields', () => {
			expect(ConfigSchema.isRequired('llmConfigs[0].provider')).toBe(true);
			expect(ConfigSchema.isRequired('agents[0].name')).toBe(true);
			expect(ConfigSchema.isRequired('agents[0].modelId')).toBe(true);
		});

		it('should identify optional fields', () => {
			expect(ConfigSchema.isRequired('llmConfigs[0].apiKey')).toBe(false);
			expect(ConfigSchema.isRequired('agents[0].description')).toBe(false);
		});
	});

	describe('getConstraints', () => {
		it('should return constraints for temperature', () => {
			const constraints = ConfigSchema.getConstraints('agents[0].temperature');

			expect(constraints).toEqual({
				min: 0,
				max: 2,
				type: 'number'
			});
		});

		it('should return constraints for topK', () => {
			const constraints = ConfigSchema.getConstraints('ragConfig.topK');

			expect(constraints).toEqual({
				min: 1,
				type: 'number'
			});
		});

		it('should return empty object for fields without constraints', () => {
			const constraints = ConfigSchema.getConstraints('agents[0].name');

			expect(constraints).toEqual({});
		});
	});
});
