import { BasePage } from '../base.page';
import { TestIds } from '../../support/testids';

type RagFixtureSettings = Record<string, unknown> & {
	llmConfigs: unknown[];
	defaultModel: string;
	titleSummaryModel: string;
	ragConfig: Record<string, unknown>;
};

const PLUGIN_ID = 'intelligence-assistant';
const MOCK_LLM_BASE_URL = 'http://127.0.0.1:43117/v1';

export class RagSettingsPage extends BasePage {
	async open(): Promise<void> {
		await this.openSettingsSection('RAG');
		await this.waitFor(TestIds.settings.ragRebuildBtn);
	}

	async configureForE2E(): Promise<void> {
		await browser.execute(async (pluginId, baseUrl) => {
			const plugin = (window as unknown as {
				app: {
					plugins: {
						plugins: Record<string, {
							settings: RagFixtureSettings;
							updateSettings(change: (settings: RagFixtureSettings) => void): Promise<void>;
							services: {
								rag: { updateConfig(config: unknown, llmConfigs?: unknown[]): void };
							};
						}>;
					};
				};
			}).app.plugins.plugins[pluginId];
			if (!plugin?.settings || typeof plugin.updateSettings !== 'function') {
				throw new Error(`Plugin settings not available: ${pluginId}`);
			}

			await plugin.updateSettings((settings) => {
				settings.llmConfigs = [{
					provider: 'openai',
					apiKey: 'sk-test-fixture',
					baseUrl,
					cachedModels: [
						{
							id: 'gpt-4o-mini',
							name: 'GPT-4o Mini',
							provider: 'openai',
							capabilities: ['chat', 'streaming'],
							enabled: true,
						},
						{
							id: 'text-embedding-3-small',
							name: 'Text Embedding 3 Small',
							provider: 'openai',
							capabilities: ['embedding'],
							enabled: true,
						},
					],
					cacheTimestamp: Date.now(),
				}];
				settings.defaultModel = 'gpt-4o-mini';
				settings.titleSummaryModel = 'gpt-4o-mini';
				settings.ragConfig = {
					...settings.ragConfig,
					enabled: true,
					chunkSize: 5000,
					chunkOverlap: 0,
					topK: 10,
					embeddingModel: 'text-embedding-3-small',
					vectorStore: 'memory',
					embedChangedFiles: false,
					similarityThreshold: 0,
					relevanceScoreWeight: 0.7,
					searchType: 'similarity',
					maxTokensPerChunk: 2048,
					minChunkSize: 1,
					enableCompression: false,
					embeddingBatchSize: 10,
					indexingMode: 'manual',
					excludeFolders: [],
					includeFileTypes: ['.md'],
					excludeFileTypes: ['.git/', 'node_modules/', '.obsidian/'],
					contextWindowLimit: 4000,
					enableSemanticCaching: false,
					cacheSize: 50,
					filterByTag: [],
					excludeByTag: [],
					chunkingStrategy: 'sentence',
					reRankingEnabled: false,
					reRankingModel: 'cross-encoder',
					enableGradingThreshold: false,
					graderModelSource: 'chat',
					graderParallelProcessing: 1,
					graderPromptTemplate: '',
					graderModel: '',
					minRelevanceScore: 0,
					minAccuracyScore: 0,
					minSupportQualityScore: 0,
				};
			});
			plugin.services.rag.updateConfig(plugin.settings.ragConfig, plugin.settings.llmConfigs);
		}, PLUGIN_ID, MOCK_LLM_BASE_URL);
	}

	async rebuildIndex(): Promise<void> {
		await this.click(TestIds.settings.ragRebuildBtn);
		await browser.waitUntil(
			async () => browser.execute((testId) => {
				const button = activeDocument.querySelector(`[data-testid="${testId}"]`);
				return button instanceof HTMLButtonElement && !button.disabled;
			}, TestIds.settings.ragRebuildBtn),
			{ timeout: 30_000, timeoutMsg: 'RAG rebuild did not finish' }
		);
	}

}
