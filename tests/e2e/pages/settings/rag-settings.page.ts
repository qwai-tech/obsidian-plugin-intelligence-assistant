import { BasePage } from '../base.page';
import { TestIds } from '../../support/testids';

const PLUGIN_ID = 'intelligence-assistant';
const MOCK_LLM_BASE_URL = 'http://127.0.0.1:43117/v1';

export class RagSettingsPage extends BasePage {
	async open(): Promise<void> {
		await browser.execute(() => {
			const app = (window as unknown as {
				app: {
					setting: {
						open(): void;
						openTabById(id: string): void;
					};
				};
			}).app;
			app.setting.open();
			app.setting.openTabById('intelligence-assistant');
		});
		await this.waitFor(TestIds.settings.shell);
		await this.clickSettingsTab('rag');
		await this.waitFor(TestIds.settings.ragRebuildBtn);
	}

	async configureForE2E(): Promise<void> {
		await browser.execute(async (pluginId, baseUrl) => {
			const plugin = (window as unknown as {
				app: {
					plugins: {
						plugins: Record<string, {
							settings: Record<string, unknown> & {
								llmConfigs: unknown[];
								defaultModel: string;
								titleSummaryModel: string;
								ragConfig: Record<string, unknown>;
							};
							saveSettings(): Promise<void>;
							getRAGManager(): {
								updateConfig(config: unknown, llmConfigs?: unknown[]): void;
							};
						}>;
					};
				};
			}).app.plugins.plugins[pluginId];
			if (!plugin?.settings || typeof plugin.saveSettings !== 'function') {
				throw new Error(`Plugin settings not available: ${pluginId}`);
			}

			plugin.settings.llmConfigs = [{
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
			plugin.settings.defaultModel = 'gpt-4o-mini';
			plugin.settings.titleSummaryModel = 'gpt-4o-mini';
			plugin.settings.ragConfig = {
				...plugin.settings.ragConfig,
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
			plugin.getRAGManager().updateConfig(plugin.settings.ragConfig, plugin.settings.llmConfigs);
			await plugin.saveSettings();
		}, PLUGIN_ID, MOCK_LLM_BASE_URL);
	}

	async rebuildIndex(): Promise<void> {
		await this.click(TestIds.settings.ragRebuildBtn);
		await browser.waitUntil(
			async () => browser.execute((testId) => {
				const button = document.querySelector(`[data-testid="${testId}"]`);
				return button instanceof HTMLButtonElement && !button.disabled;
			}, TestIds.settings.ragRebuildBtn),
			{ timeout: 30_000, timeoutMsg: 'RAG rebuild did not finish' }
		);
	}

	private async clickSettingsTab(tabId: string): Promise<void> {
		await browser.waitUntil(
			async () => browser.execute((testId, id) => {
				return Array.from(document.querySelectorAll(`[data-testid="${testId}"]`))
					.some(tab => tab.instanceOf(HTMLElement) && tab.getAttribute('data-tab-id') === id);
			}, TestIds.settings.tab, tabId),
			{ timeout: 10_000, timeoutMsg: `Settings tab not found: ${tabId}` }
		);
		await browser.execute((testId, id) => {
			const tab = Array.from(document.querySelectorAll(`[data-testid="${testId}"]`))
				.find(candidate => candidate.instanceOf(HTMLElement) && candidate.getAttribute('data-tab-id') === id);
			if (!(tab instanceof HTMLElement)) {
				throw new Error(`Settings tab not found: ${id}`);
			}
			tab.click();
		}, TestIds.settings.tab, tabId);
	}
}
