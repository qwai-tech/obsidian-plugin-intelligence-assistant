import { RagSettingsPage } from '../../pages/settings/rag-settings.page';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { mockLLM } from '../../support/mock-llm';
import { VaultFixture } from '../../support/vault-fixture';

interface VectorStoreFile {
	_chunks: Array<{
		id: string;
		content: string;
		embedding?: number[];
		metadata: { path: string };
	}>;
}

function constantEmbeddings(count: number): number[][] {
	return Array.from({ length: count }, () => [1, 0, 0, 0]);
}

describe('RAG indexing', () => {
	const ragSettings = new RagSettingsPage();
	const vault = new VaultFixture();

	beforeEach(async () => {
		await vault.reset();
		await mockLLM.clearAll();
		await waitForPluginReady();
		await ragSettings.configureForE2E();
	});

	it('rebuilds the vector store from vault notes with deterministic embeddings', async () => {
		await mockLLM.embeddings(constantEmbeddings(40));

		await ragSettings.open();
		await ragSettings.rebuildIndex();

		await browser.waitUntil(
			async () => vault.runtimeDataFileExists('data/vector_store/notes.json'),
			{ timeout: 10_000, timeoutMsg: 'Vector store file was not written' }
		);

		const vectorStore = await vault.readRuntimeDataFile<VectorStoreFile>('data/vector_store/notes.json');
		const indexedPaths = new Set(vectorStore._chunks.map(chunk => chunk.metadata.path));

		await expect(Array.from(indexedPaths)).toEqual(expect.arrayContaining([
			'PKM Principles.md',
			'LLM Architecture.md',
			'Reading List.md',
		]));
		await expect(vectorStore._chunks.length).toBeGreaterThanOrEqual(3);
		await expect(vectorStore._chunks.every(chunk => Array.isArray(chunk.embedding))).toBe(true);

		const embeddingCalls = (await mockLLM.getCalls()).filter(call => call.path === '/v1/embeddings');
		await expect(embeddingCalls.length).toBeGreaterThanOrEqual(3);
	});
});
