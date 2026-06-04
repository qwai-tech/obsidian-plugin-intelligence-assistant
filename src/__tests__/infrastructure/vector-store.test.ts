import { VectorStore } from '@/infrastructure/vector-store';
import { RAGManager } from '@/infrastructure/rag-manager';
import { EmbeddingManager } from '@/infrastructure/embedding-manager';
import type { RAGConfig } from '@/types';

jest.mock('@/infrastructure/embedding-manager', () => ({
	EmbeddingManager: {
		generateEmbedding: jest.fn(),
		getDefaultEmbeddingModel: jest.fn(() => ({ id: 'test-embedding' })),
		cleanup: jest.fn(),
	},
}));

const makeConfig = (overrides: Partial<RAGConfig> = {}): RAGConfig => ({
	enabled: true,
	chunkSize: 20,
	chunkOverlap: 0,
	topK: 5,
	embeddingModel: 'test-embedding',
	vectorStore: 'disk',
	embedChangedFiles: false,
	similarityThreshold: 0,
	relevanceScoreWeight: 0.5,
	searchType: 'semantic',
	maxTokensPerChunk: 1000,
	minChunkSize: 1,
	enableCompression: false,
	embeddingBatchSize: 10,
	indexingMode: 'manual',
	excludeFolders: [],
	includeFileTypes: ['md'],
	excludeFileTypes: [],
	contextWindowLimit: 2000,
	enableSemanticCaching: false,
	cacheSize: 50,
	filterByTag: [],
	excludeByTag: [],
	chunkingStrategy: 'paragraph',
	reRankingEnabled: false,
	reRankingModel: '',
	enableGradingThreshold: false,
	graderModelSource: 'chat',
	graderParallelProcessing: 3,
	...overrides,
});

const makeApp = (content = '') => {
	const adapter = {
		exists: jest.fn(async () => true),
		read: jest.fn(async () => {
			throw new Error('missing');
		}),
		write: jest.fn(async () => undefined),
	};
	return {
		vault: {
			adapter,
			read: jest.fn(async () => content),
			getMarkdownFiles: jest.fn(() => []),
			on: jest.fn(),
			off: jest.fn(),
		},
	};
};

describe('VectorStore', () => {
	beforeEach(() => {
		(EmbeddingManager.generateEmbedding as jest.Mock).mockReset();
		(EmbeddingManager.generateEmbedding as jest.Mock).mockImplementation(async () => [1, 0, 0]);
	});

	it('resolves addFile only after every scheduled chunk batch has been indexed and saved', async () => {
		const paragraphs = Array.from({ length: 25 }, (_, i) => `paragraph-${i}`).join('\n\n');
		const app = makeApp(paragraphs);
		const store = new VectorStore(app as any, [{ provider: 'openai', apiKey: 'k' }] as any);

		await store.addFile({
			path: 'notes/large.md',
			basename: 'large',
			stat: { mtime: 123 },
		} as any, makeConfig());

		expect(store.getStoredChunks()).toHaveLength(25);
		expect(app.vault.adapter.write).toHaveBeenCalledTimes(1);
	});
});

describe('RAGManager', () => {
	it('does not clear the existing vector store when RAG is disabled through config', async () => {
		const manager = new RAGManager(makeApp() as any, makeConfig(), [{ provider: 'openai', apiKey: 'k' }] as any);
		const vectorStore = (manager as any).vectorStore;
		vectorStore.clear = jest.fn();

		manager.updateConfig(makeConfig({ enabled: false }));

		expect(vectorStore.clear).not.toHaveBeenCalled();
	});
});
