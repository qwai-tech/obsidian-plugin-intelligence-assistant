import * as http from 'node:http';
import { loadDotEnvTest } from './release-env';

loadDotEnvTest();

const OLLAMA_URL = process.env.E2E_OLLAMA_URL ?? 'http://localhost:11434';
const PLUGIN_ID = 'intelligence-assistant';

export const ollamaModels = {
	chat: process.env.E2E_OLLAMA_CHAT_MODEL ?? 'qwen3.5:0.8b',
	fixed: process.env.E2E_OLLAMA_FIXED_MODEL ?? 'qwen3.5:2b',
	get all(): string[] {
		return [...new Set([this.chat, this.fixed])];
	},
};

export const FIXED_AGENT_ID = 'e2e-real-fixed-agent';

export async function skipUnlessOllama(ctx: { skip(): void }): Promise<void> {
	const installed = await installedModels();
	const missing = ollamaModels.all.filter(model => !installed.includes(model));
	if (missing.length > 0) {
		console.warn(`[release-e2e] Skipping real Ollama spec; ${OLLAMA_URL} lacks ${missing.join(', ')}`);
		ctx.skip();
	}
}

export async function seedOllama(): Promise<void> {
	await browser.execute(async (pluginId, baseUrl, models, defaultModel, fixedModel, agentId) => {
		const plugin = (window as unknown as { app: { plugins: { plugins: Record<string, {
			updateSettings(change: (settings: Record<string, unknown>) => void): Promise<void>;
		}> } } }).app.plugins.plugins[pluginId];
		await plugin.updateSettings((settings) => {
			const configs = (settings.llmConfigs as Array<{ provider: string }>).filter(config => config.provider !== 'ollama');
			configs.unshift({
				provider: 'ollama',
				baseUrl,
				cachedModels: models.map(id => ({ id: `ollama:${id}`, name: id, provider: 'ollama', capabilities: ['chat', 'streaming', 'vision'], enabled: true })),
				cacheTimestamp: Date.now(),
			} as { provider: string });
			settings.llmConfigs = configs;
			settings.defaultModel = `ollama:${defaultModel}`;
			const agents = (settings.agents as Array<{ id: string }>).filter(agent => agent.id !== agentId);
			agents.push({
				id: agentId,
				name: 'E2E real fixed agent',
				description: 'Uses a fixed model',
				icon: 'bot',
				modelStrategy: { strategy: 'fixed', modelId: `ollama:${fixedModel}` },
				temperature: 0,
				maxTokens: 200,
				systemPromptId: '',
				contextWindow: 10,
				toolAccess: { sources: {} },
				memoryType: 'none',
				memoryConfig: { summaryInterval: 5, maxMemories: 10 },
				ragEnabled: false,
				webSearchEnabled: false,
				maxSteps: 2,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			} as { id: string });
			settings.agents = agents;
		});
	}, PLUGIN_ID, OLLAMA_URL, ollamaModels.all, ollamaModels.chat, ollamaModels.fixed, FIXED_AGENT_ID);
}

export async function activateAgent(agentId: string): Promise<void> {
	await browser.execute(async (pluginId, id) => {
		const plugin = (window as unknown as { app: { plugins: { plugins: Record<string, {
			updateSettings(change: (settings: Record<string, unknown>) => void): Promise<void>;
		}> } } }).app.plugins.plugins[pluginId];
		await plugin.updateSettings((settings) => { settings.activeAgentId = id; });
	}, PLUGIN_ID, agentId);
}

function installedModels(): Promise<string[]> {
	return new Promise((resolve) => {
		const request = http.get(`${OLLAMA_URL}/api/tags`, { timeout: 3_000 }, (response) => {
			let body = '';
			response.on('data', (chunk: Buffer) => { body += chunk.toString(); });
			response.on('end', () => {
				try {
					resolve(((JSON.parse(body) as { models?: Array<{ name: string }> }).models ?? []).map(model => model.name));
				} catch {
					resolve([]);
				}
			});
		});
		request.on('timeout', () => request.destroy());
		request.on('error', () => resolve([]));
	});
}
