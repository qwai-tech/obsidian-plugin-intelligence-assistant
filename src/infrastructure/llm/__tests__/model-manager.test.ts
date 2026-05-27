import { promises as fs } from 'fs';
import { ModelManager } from '../model-manager';
import type { LLMConfig } from '@/types';

describe('ModelManager', () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('uses discovered CLI model config when refreshing Claude Code models without an API key', async () => {
		jest.spyOn(fs, 'readFile').mockImplementation(async (file) => {
			if (String(file).endsWith('.claude.json')) {
				return JSON.stringify({ model: 'claude-opus-4-7' });
			}
			throw new Error('not found');
		});

		const config: LLMConfig = { provider: 'claude-code' };
		const models = await ModelManager.getModelsForConfig(config, true);

		expect(models[0]).toMatchObject({
			id: 'claude-code:claude-opus-4-7',
			name: 'claude-opus-4-7',
			provider: 'claude-code',
		});
	});

	it('uses explicit CLI model ID before scanning local CLI config', async () => {
		jest.spyOn(fs, 'readFile').mockRejectedValue(new Error('not found'));

		const config: LLMConfig = {
			provider: 'claude-code',
			modelId: 'deepseek-v4-pro[1m]',
		};
		const models = await ModelManager.getModelsForConfig(config, true);

		expect(models).toHaveLength(1);
		expect(models[0]).toMatchObject({
			id: 'claude-code:deepseek-v4-pro[1m]',
			name: 'deepseek-v4-pro[1m]',
			provider: 'claude-code',
		});
	});

	it('uses explicit CLI model ID before stored cached models', async () => {
		const config: LLMConfig = {
			provider: 'claude-code',
			modelId: 'deepseek-v4-flash',
			cachedModels: [{
				id: 'claude-code:claude-3-5-sonnet-20241022',
				name: 'Claude 3.5 Sonnet (Code)',
				provider: 'claude-code',
				capabilities: ['chat'],
				enabled: true,
			}],
		};

		const models = await ModelManager.getModelsForConfig(config);

		expect(models.map(model => model.id)).toEqual(['claude-code:deepseek-v4-flash']);
	});

	it('uses project Claude Code model usage when no explicit model is configured', async () => {
		jest.spyOn(fs, 'readFile').mockImplementation(async (file) => {
			if (String(file).endsWith('.claude.json')) {
				return JSON.stringify({
					projects: {
						[process.cwd()]: {
							lastModelUsage: {
								'claude-haiku-4-5-20251001': { inputTokens: 10 },
								'claude-opus-4-7[1m]': { inputTokens: 20 },
								'deepseek-v4-pro[1m]': { inputTokens: 30 },
							},
						},
					},
				});
			}
			throw new Error('not found');
		});

		const config: LLMConfig = { provider: 'claude-code' };
		const models = await ModelManager.getModelsForConfig(config, true);

		expect(models.map(model => model.id)).toEqual([
			'claude-code:deepseek-v4-pro[1m]',
			'claude-code:claude-opus-4-7[1m]',
			'claude-code:claude-haiku-4-5-20251001',
		]);
	});

	it('does not scan all Claude Code project usage when runtime cwd does not match a project', async () => {
		jest.spyOn(process, 'cwd').mockReturnValue('/Applications/Obsidian.app');
		jest.spyOn(fs, 'readFile').mockImplementation(async (file) => {
			if (String(file).endsWith('.claude.json')) {
				return JSON.stringify({
					projects: {
						'/Users/test/project-a': {
							lastModelUsage: {
								'claude-haiku-4-5-20251001': { inputTokens: 10 },
								'deepseek-v4-flash': { inputTokens: 999 },
							},
						},
						'/Users/test/project-b': {
							lastModelUsage: {
								'claude-opus-4-7[1m]': { inputTokens: 20 },
								'deepseek-v4-pro[1m]': { inputTokens: 999 },
							},
						},
					},
				});
			}
			throw new Error('not found');
		});

		const config: LLMConfig = { provider: 'claude-code' };
		const models = await ModelManager.getModelsForConfig(config, true);

		expect(models.map(model => model.id)).toEqual([
			'claude-code:claude-3-5-sonnet-20241022',
			'claude-code:claude-3-5-haiku-20241022',
		]);
	});
});
