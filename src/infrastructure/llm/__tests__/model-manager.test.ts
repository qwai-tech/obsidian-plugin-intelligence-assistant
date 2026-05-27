import { promises as fs } from 'fs';
import { EventEmitter } from 'events';
import { Readable } from 'stream';
import { spawn } from 'child_process';
import { ModelManager } from '../model-manager';
import type { LLMConfig } from '@/types';

jest.mock('child_process', () => ({
	spawn: jest.fn(),
}));

const mockedSpawn = spawn as jest.MockedFunction<typeof spawn>;

describe('ModelManager', () => {
	afterEach(() => {
		jest.restoreAllMocks();
		jest.clearAllMocks();
	});

	it('uses discovered Claude Code settings model when refreshing without an API key', async () => {
		jest.spyOn(fs, 'readFile').mockImplementation(async (file) => {
			if (String(file).endsWith('.claude/settings.json')) {
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

	it('uses Claude Code availableModels setting instead of stale defaults', async () => {
		jest.spyOn(fs, 'readFile').mockImplementation(async (file) => {
			if (String(file).endsWith('.claude/settings.json')) {
				return JSON.stringify({
					availableModels: ['sonnet', 'opus[1m]'],
				});
			}
			throw new Error('not found');
		});

		const config: LLMConfig = { provider: 'claude-code' };
		const models = await ModelManager.getModelsForConfig(config, true);

		expect(models.map(model => model.id)).toEqual([
			'claude-code:sonnet',
			'claude-code:opus[1m]',
		]);
	});

	it('does not scan Claude Code project usage history as model configuration', async () => {
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

		expect(models.map(model => model.id)).toContain('claude-code:default');
		expect(models.map(model => model.id)).not.toContain('claude-code:claude-opus-4-7[1m]');
		expect(models.map(model => model.id)).not.toContain('claude-code:deepseek-v4-pro[1m]');
	});

	it('reads Qwen Code model.name from settings', async () => {
		jest.spyOn(fs, 'readFile').mockImplementation(async (file) => {
			if (String(file).endsWith('.qwen/settings.json')) {
				return JSON.stringify({ model: { name: 'qwen3-coder-plus' } });
			}
			throw new Error('not found');
		});

		const config: LLMConfig = { provider: 'qwen-code' };
		const models = await ModelManager.getModelsForConfig(config, true);

		expect(models.map(model => model.id)).toEqual(['qwen-code:qwen3-coder-plus']);
	});

	it('reads Qwen Code modelProviders from settings', async () => {
		jest.spyOn(fs, 'readFile').mockImplementation(async (file) => {
			if (String(file).endsWith('.qwen/settings.json')) {
				return JSON.stringify({
					model: { name: 'qwen3-coder-flash' },
					modelProviders: {
						openai: [
							{ id: 'gpt-5.5', name: 'GPT-5.5', envKey: 'OPENAI_API_KEY' },
							{ id: 'gpt-5.5-mini', name: 'GPT-5.5 Mini', envKey: 'OPENAI_API_KEY' },
						],
					},
				});
			}
			throw new Error('not found');
		});

		const config: LLMConfig = { provider: 'qwen-code' };
		const models = await ModelManager.getModelsForConfig(config, true);

		expect(models.map(model => model.id)).toEqual([
			'qwen-code:gpt-5.5',
			'qwen-code:gpt-5.5-mini',
			'qwen-code:qwen3-coder-flash',
		]);
	});

	it('reads Codex model catalog from codex debug models', async () => {
		jest.spyOn(fs, 'readFile').mockRejectedValue(new Error('not found'));

		const proc = new EventEmitter() as EventEmitter & {
			stdout: Readable;
			stderr: Readable;
		};
		proc.stdout = Readable.from([JSON.stringify({
			models: [
				{ id: 'gpt-5.5' },
				{ id: 'gpt-5.5-codex' },
			],
		})]);
		proc.stderr = Readable.from([]);
		mockedSpawn.mockReturnValue(proc as ReturnType<typeof spawn>);
		setTimeout(() => proc.emit('close', 0), 0);

		const config: LLMConfig = { provider: 'codex' };
		const models = await ModelManager.getModelsForConfig(config, true);

		expect(mockedSpawn).toHaveBeenCalledWith('codex', ['debug', 'models'], expect.any(Object));
		expect(models.map(model => model.id)).toEqual([
			'codex:gpt-5.5',
			'codex:gpt-5.5-codex',
		]);
	});
});
