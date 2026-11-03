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

export interface OllamaAgentSpec {
	id: string;
	name: string;
	toolAccess: Record<string, unknown>;
	maxSteps: number;
	maxTokens: number;
}

export const WRITER_AGENT_ID = 'e2e-real-writer-agent';

const FIXED_AGENT: OllamaAgentSpec = { id: FIXED_AGENT_ID, name: 'E2E real fixed agent', toolAccess: { sources: {} }, maxSteps: 2, maxTokens: 200 };
export const WRITER_AGENT: OllamaAgentSpec = {
	id: WRITER_AGENT_ID,
	name: 'E2E real writer agent',
	toolAccess: { sources: { 'builtin:builtin': ['builtin:builtin:create_note'] } },
	maxSteps: 4,
	maxTokens: 8_000,
};

export async function seedOllama(agentSpecs: OllamaAgentSpec[] = [FIXED_AGENT]): Promise<void> {
	await browser.execute(async (pluginId, baseUrl, models, defaultModel, fixedModel, specs) => {
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
			const ids = new Set(specs.map(spec => spec.id));
			const agents = (settings.agents as Array<{ id: string }>).filter(agent => !ids.has(agent.id));
			for (const spec of specs) {
				agents.push({
					id: spec.id,
					name: spec.name,
					description: 'Uses a fixed model',
					icon: 'bot',
					modelStrategy: { strategy: 'fixed', modelId: `ollama:${fixedModel}` },
					temperature: 0,
					maxTokens: spec.maxTokens,
					systemPromptId: '',
					contextWindow: 10,
					toolAccess: spec.toolAccess,
					memoryType: 'none',
					memoryConfig: { summaryInterval: 5, maxMemories: 10 },
					ragEnabled: false,
					webSearchEnabled: false,
					maxSteps: spec.maxSteps,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				} as { id: string });
			}
			settings.agents = agents;
		});
	}, PLUGIN_ID, OLLAMA_URL, ollamaModels.all, ollamaModels.chat, ollamaModels.fixed, agentSpecs);
}

export const OLLAMA_EMBEDDING_MODEL = process.env.E2E_OLLAMA_EMBEDDING_MODEL ?? 'qwen3-embedding:4b';

export async function enableOllamaRag(): Promise<void> {
	await browser.execute(async (pluginId, embeddingModel) => {
		const plugin = (window as unknown as { app: { plugins: { plugins: Record<string, {
			updateSettings(change: (settings: Record<string, unknown>) => void): Promise<void>;
		}> } } }).app.plugins.plugins[pluginId];
		await plugin.updateSettings((settings) => {
			const ollama = (settings.llmConfigs as Array<{ provider: string; cachedModels?: Array<Record<string, unknown>> }>).find(config => config.provider === 'ollama');
			ollama?.cachedModels?.push({ id: `ollama:${embeddingModel}`, name: embeddingModel, provider: 'ollama', capabilities: ['embedding'], enabled: true });
			Object.assign(settings.ragConfig as Record<string, unknown>, { enabled: true, embeddingModel: `ollama:${embeddingModel}`, enableGradingThreshold: false });
		});
	}, PLUGIN_ID, OLLAMA_EMBEDDING_MODEL);
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
