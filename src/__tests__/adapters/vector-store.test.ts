import { TFile } from 'obsidian';
import { VectorStore } from '@/adapters/rag/vector-store';
import { RAGManager } from '@/adapters/rag/rag-manager';
import { EmbeddingManager } from '@/adapters/rag/embedding-manager';
import type { RAGConfig } from '@/features/knowledge/types/rag';

const STORE_PATH = '.obsidian/plugins/intelligence-assistant/data/vector_store/notes.json';

jest.mock('@/adapters/rag/embedding-manager', () => ({
	EmbeddingManager: {
		generateEmbedding: jest.fn(),
		getDefaultEmbeddingModel: jest.fn(() => ({ id: 'test-embedding' })),
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
		read: jest.fn(async (): Promise<string> => {
			throw new Error('missing');
		}),
		write: jest.fn(async () => undefined),
		remove: jest.fn(async () => undefined),
		rename: jest.fn(async () => undefined),
		mkdir: jest.fn(async () => undefined),
	};
	return {
		vault: {
			adapter,
			read: jest.fn(async () => content),
			getMarkdownFiles: jest.fn(() => []),
			getFileByPath: jest.fn(() => null),
			on: jest.fn(),
			off: jest.fn(),
		},
		metadataCache: { getFileCache: jest.fn(() => null) },
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
		const store = new VectorStore(app as any, STORE_PATH, [{ provider: 'openai', apiKey: 'k' }] as any);

		await store.addFile({
			path: 'notes/large.md',
			basename: 'large',
			stat: { mtime: 123 },
		} as any, makeConfig());

		expect(store.getStoredChunks()).toHaveLength(25);
		expect(app.vault.adapter.write).toHaveBeenCalledTimes(1);
	});

	it('embeds a file again when an earlier embedding attempt failed', async () => {
		const app = makeApp('alpha');
		const store = new VectorStore(app as any, STORE_PATH, [{ provider: 'openai', apiKey: 'k' }] as any);
		const file = { path: 'a.md', basename: 'a', stat: { mtime: 1 } } as any;
		(EmbeddingManager.generateEmbedding as jest.Mock).mockRejectedValue(new Error('offline'));
		await store.addFile(file, makeConfig());
		(EmbeddingManager.generateEmbedding as jest.Mock).mockReset().mockResolvedValue([1, 0, 0]);

		await store.addFile(file, makeConfig());

		expect(store.getStoredChunks().every(chunk => chunk.embedding?.length === 3)).toBe(true);
	});

	it('indexing one file leaves files whose path starts with the same text alone', async () => {
		const app = makeApp('alpha');
		const store = new VectorStore(app as any, STORE_PATH, [{ provider: 'openai', apiKey: 'k' }] as any);
		await store.addFile({ path: 'a.md-copy.md', basename: 'a.md-copy', stat: { mtime: 1 } } as any, makeConfig());
		app.vault.read.mockResolvedValue('changed');

		await store.addFile({ path: 'a.md', basename: 'a', stat: { mtime: 2 } } as any, makeConfig());
		await store.removeFile('a.md');

		expect(store.getStoredChunks().map(chunk => chunk.metadata.path)).toEqual(['a.md-copy.md']);
	});

	it('runs overlapping index requests for one file one after the other', async () => {
		const app = makeApp('alpha\n\nbeta');
		const store = new VectorStore(app as any, STORE_PATH, [{ provider: 'openai', apiKey: 'k' }] as any);
		const file = { path: 'a.md', basename: 'a', stat: { mtime: 1 } } as any;
		const first = store.addFile(file, makeConfig());
		app.vault.read.mockResolvedValue('alpha\n\nbeta\n\ngamma');

		await Promise.all([first, store.addFile(file, makeConfig())]);

		const ids = store.getStoredChunks().map(chunk => chunk.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(store.getStoredChunks().map(chunk => chunk.content).join('\n\n')).toBe('alpha\n\nbeta\n\ngamma');
	});

	it('a note deleted or renamed while it is being embedded leaves no chunks under its old path', async () => {
		let release!: () => void;
		const gate = new Promise<void>(resolve => { release = resolve; });
		(EmbeddingManager.generateEmbedding as jest.Mock).mockImplementation(async () => {
			await gate;
			return [1, 0, 0];
		});
		const app = makeApp('alpha');
		const store = new VectorStore(app as any, STORE_PATH, [{ provider: 'openai', apiKey: 'k' }] as any);
		const deleted = store.addFile({ path: 'gone.md', basename: 'gone', stat: { mtime: 1 } } as any, makeConfig());
		const moved = store.addFile({ path: 'old.md', basename: 'old', stat: { mtime: 1 } } as any, makeConfig());
		await Promise.resolve();

		const removal = store.removeFile('gone.md');
		const rename = store.renameFile('old.md', 'new.md');
		release();
		await Promise.all([deleted, moved, removal, rename]);

		expect(store.getStoredChunks().map(chunk => chunk.metadata.path)).toEqual(['new.md']);
	});

	it('removeFile drops only the matching file\'s chunks and persists', async () => {
		const app = makeApp('alpha\n\nbeta');
		const store = new VectorStore(app as any, STORE_PATH, [{ provider: 'openai', apiKey: 'k' }] as any);
		await store.addFile({ path: 'a.md', basename: 'a', stat: { mtime: 1 } } as any, makeConfig());
		await store.addFile({ path: 'b.md', basename: 'b', stat: { mtime: 1 } } as any, makeConfig());
		const before = store.getStoredChunks().length;

		const removed = await store.removeFile('a.md');

		expect(removed).toBeGreaterThan(0);
		expect(store.getStoredChunks().every((c) => c.metadata.path === 'b.md')).toBe(true);
		expect(store.getStoredChunks().length).toBe(before - removed);
	});

	it('renameFile re-keys chunk ids + metadata path without re-embedding', async () => {
		const app = makeApp('alpha\n\nbeta');
		const store = new VectorStore(app as any, STORE_PATH, [{ provider: 'openai', apiKey: 'k' }] as any);
		await store.addFile({ path: 'old.md', basename: 'old', stat: { mtime: 1 } } as any, makeConfig());
		(EmbeddingManager.generateEmbedding as jest.Mock).mockClear();

		const renamed = await store.renameFile('old.md', 'new.md');

		expect(renamed).toBeGreaterThan(0);
		const chunks = store.getStoredChunks();
		expect(chunks.every((c) => c.metadata.path === 'new.md')).toBe(true);
		expect(chunks.every((c) => c.id.startsWith('new.md-'))).toBe(true);
		// No new embeddings were generated by the rename.
		expect(EmbeddingManager.generateEmbedding).not.toHaveBeenCalled();
	});

	const persisted = (paths: string[]) => JSON.stringify({
		_chunks: paths.map((path) => ({
			id: `${path}-0`,
			content: `content of ${path}`,
			embedding: [0, 1, 0],
			metadata: { source: path, path, timestamp: 1 },
		})),
		createdAt: 1,
		updatedAt: 1,
	});

	const lastWrittenPaths = (app: ReturnType<typeof makeApp>): string[] => {
		const calls = app.vault.adapter.write.mock.calls as unknown as Array<[string, string]>;
		const [, body] = calls[calls.length - 1];
		return (JSON.parse(body) as { _chunks: Array<{ metadata: { path: string } }> })._chunks.map((c) => c.metadata.path);
	};

	it('keeps chunks already on disk when a file is indexed before any explicit load', async () => {
		const app = makeApp('fresh note');
		app.vault.adapter.read.mockImplementation(async () => persisted(['kept.md']));
		const store = new VectorStore(app as any, STORE_PATH, [{ provider: 'openai', apiKey: 'k' }] as any);

		await store.addFile({ path: 'new.md', basename: 'new', stat: { mtime: 2 } } as any, makeConfig());

		expect(lastWrittenPaths(app)).toEqual(expect.arrayContaining(['kept.md', 'new.md']));
	});

	it('keeps chunks already on disk when a file is removed before any explicit load', async () => {
		const app = makeApp();
		app.vault.adapter.read.mockImplementation(async () => persisted(['kept.md', 'gone.md']));
		const store = new VectorStore(app as any, STORE_PATH, [{ provider: 'openai', apiKey: 'k' }] as any);

		await store.removeFile('gone.md');

		expect(lastWrittenPaths(app)).toEqual(['kept.md']);
	});

	it('loads from disk once, so a later load cannot discard newer in-memory chunks', async () => {
		const app = makeApp('fresh note');
		app.vault.adapter.read.mockImplementation(async () => persisted(['kept.md']));
		const store = new VectorStore(app as any, STORE_PATH, [{ provider: 'openai', apiKey: 'k' }] as any);
		await store.load();
		await store.addFile({ path: 'new.md', basename: 'new', stat: { mtime: 2 } } as any, makeConfig());

		await store.load();

		expect(store.getStoredChunks().map((c) => c.metadata.path)).toEqual(expect.arrayContaining(['kept.md', 'new.md']));
		expect(app.vault.adapter.read).toHaveBeenCalledTimes(1);
	});
});

describe('VectorStore change detection', () => {
	beforeEach(() => {
		(EmbeddingManager.generateEmbedding as jest.Mock).mockReset();
		(EmbeddingManager.generateEmbedding as jest.Mock).mockImplementation(async () => [1, 0, 0]);
	});

	const note = { path: 'n.md', basename: 'n', stat: { mtime: 1 } } as any;

	it('does not re-embed a note whose content has not changed', async () => {
		const store = new VectorStore(makeApp('alpha\n\nbeta') as any, STORE_PATH, [] as any);
		await store.addFile(note, makeConfig());
		(EmbeddingManager.generateEmbedding as jest.Mock).mockClear();

		await store.addFile(note, makeConfig());

		expect(EmbeddingManager.generateEmbedding).not.toHaveBeenCalled();
	});

	it('re-embeds an unchanged note when the embedding model changes', async () => {
		const store = new VectorStore(makeApp('alpha') as any, STORE_PATH, [] as any);
		await store.addFile(note, makeConfig());
		(EmbeddingManager.generateEmbedding as jest.Mock).mockClear();

		await store.addFile(note, makeConfig({ embeddingModel: 'other-model' }));

		expect(EmbeddingManager.generateEmbedding).toHaveBeenCalled();
	});

	it('re-embeds a note whose content changed', async () => {
		const app = makeApp('alpha');
		const store = new VectorStore(app as any, STORE_PATH, [] as any);
		await store.addFile(note, makeConfig());
		app.vault.read.mockImplementation(async () => 'gamma');
		(EmbeddingManager.generateEmbedding as jest.Mock).mockClear();

		await store.addFile(note, makeConfig());

		expect(EmbeddingManager.generateEmbedding).toHaveBeenCalled();
		expect(store.getStoredChunks().map((c) => c.content)).toEqual(['gamma']);
	});

	it('only scores chunks embedded with the model used for the query', async () => {
		const store = new VectorStore(makeApp('alpha') as any, STORE_PATH, [] as any);
		await store.addFile({ ...note, path: 'old.md' }, makeConfig({ embeddingModel: 'old-model' }));
		await store.addFile({ ...note, path: 'new.md' }, makeConfig());

		const results = await store.search('alpha', makeConfig(), 'test-embedding');

		expect(results.map((r) => r.chunk.metadata.path)).toEqual(['new.md']);
	});
});

describe('RAGManager', () => {
	it('search returns knowledge sources mapped from matching chunks', async () => {
		const manager = new RAGManager(makeApp() as any, makeConfig(), [{ provider: 'openai', apiKey: 'k' }] as any, STORE_PATH);
		(manager as any).vectorStore.search = jest.fn(async () => [
			{ chunk: { id: 'c1', content: 'Body', metadata: { path: 'notes/a.md', title: 'A', source: 'vault', timestamp: 1 } }, similarity: 0.8 },
		]);

		expect(await manager.search('query')).toEqual([{ path: 'notes/a.md', content: 'Body', similarity: 0.8, title: 'A' }]);
	});

	it('search returns nothing when RAG is disabled', async () => {
		const manager = new RAGManager(makeApp() as any, makeConfig({ enabled: false }), [{ provider: 'openai', apiKey: 'k' }] as any, STORE_PATH);
		(manager as any).vectorStore.search = jest.fn();

		expect(await manager.search('query')).toEqual([]);
		expect((manager as any).vectorStore.search).not.toHaveBeenCalled();
	});

	it('does not clear the existing vector store when RAG is disabled through config', async () => {
		const manager = new RAGManager(makeApp() as any, makeConfig(), [{ provider: 'openai', apiKey: 'k' }] as any, STORE_PATH);
		const vectorStore = (manager as any).vectorStore;
		vectorStore.clear = jest.fn();

		manager.updateConfig(makeConfig({ enabled: false }));

		expect(vectorStore.clear).not.toHaveBeenCalled();
	});

	it('removeFile / renameFile delegate to the vector store when enabled', async () => {
		const manager = new RAGManager(makeApp() as any, makeConfig(), [{ provider: 'openai', apiKey: 'k' }] as any, STORE_PATH);
		const vectorStore = (manager as any).vectorStore;
		vectorStore.removeFile = jest.fn(async () => 3);
		vectorStore.renameFile = jest.fn(async () => 2);

		expect(await manager.removeFile('x.md')).toBe(3);
		expect(vectorStore.removeFile).toHaveBeenCalledWith('x.md');
		expect(await manager.renameFile('a.md', 'b.md')).toBe(2);
		expect(vectorStore.renameFile).toHaveBeenCalledWith('a.md', 'b.md');
	});

	it('removeFile / renameFile are no-ops when RAG is disabled', async () => {
		const manager = new RAGManager(makeApp() as any, makeConfig({ enabled: false }), [{ provider: 'openai', apiKey: 'k' }] as any, STORE_PATH);
		const vectorStore = (manager as any).vectorStore;
		vectorStore.removeFile = jest.fn();
		vectorStore.renameFile = jest.fn();

		expect(await manager.removeFile('x.md')).toBe(0);
		expect(await manager.renameFile('a.md', 'b.md')).toBe(0);
		expect(vectorStore.removeFile).not.toHaveBeenCalled();
		expect(vectorStore.renameFile).not.toHaveBeenCalled();
	});

	it('registers no vault listener of its own, leaving change tracking to the incremental indexer', async () => {
		const app = makeApp();
		const manager = new RAGManager(app as any, makeConfig({ embedChangedFiles: true }), [{ provider: 'openai', apiKey: 'k' }] as any, STORE_PATH);

		await manager.initialize();
		manager.updateConfig(makeConfig({ embedChangedFiles: false }));
		manager.updateConfig(makeConfig({ embedChangedFiles: true }));

		expect(app.vault.on).not.toHaveBeenCalled();
	});

	it('passes refreshed LLM configs to the vector store on updateConfig', () => {
		const manager = new RAGManager(makeApp() as any, makeConfig(), [{ provider: 'openai', apiKey: 'old' }] as any, STORE_PATH);
		const refreshed = [{ provider: 'openai', apiKey: 'new' }] as any;

		manager.updateConfig(makeConfig(), refreshed);

		expect((manager as any).vectorStore.llmConfigs).toBe(refreshed);
	});

	describe('file filters', () => {
		const makeFilteredApp = (tagsByPath: Record<string, string[]>) => {
			const app = makeApp('body');
			const files = Object.keys(tagsByPath).map(path => Object.assign(new TFile(), { path, extension: 'md', basename: path, stat: { mtime: 1 } }));
			Object.assign(app.vault, {
				getMarkdownFiles: jest.fn(() => files),
				getFileByPath: jest.fn((path: string) => files.find(file => file.path === path) ?? null),
			});
			const metadataCache = {
				getFileCache: jest.fn((file: TFile) => ({ tags: (tagsByPath[file.path] ?? []).map(tag => ({ tag })) })),
			};
			return { ...app, metadataCache, files };
		};

		it('never sends notes in an excluded folder or with an excluded tag to the embedding provider', async () => {
			const app = makeFilteredApp({ 'Private/secret.md': [], 'tagged.md': ['#private'], 'open.md': [] });
			const manager = new RAGManager(app as any, makeConfig({ excludeFolders: ['Private'], excludeByTag: ['private'] }), [{ provider: 'openai', apiKey: 'k' }] as any, STORE_PATH);
			const vectorStore = (manager as any).vectorStore;
			vectorStore.addFile = jest.fn(async () => undefined);
			vectorStore.removeFile = jest.fn(async () => 0);

			await manager.indexVault();
			for (const file of app.files) await manager.indexFile(file);

			expect(vectorStore.addFile.mock.calls.map(([file]: [TFile]) => file.path)).toEqual(['open.md', 'open.md']);
			expect(vectorStore.removeFile).toHaveBeenCalledWith('Private/secret.md');
			expect(vectorStore.removeFile).toHaveBeenCalledWith('tagged.md');
		});

		it('leaves out search results from notes excluded after they were indexed', async () => {
			const app = makeFilteredApp({ 'Private/secret.md': [], 'open.md': [] });
			const manager = new RAGManager(app as any, makeConfig({ excludeFolders: ['Private'] }), [{ provider: 'openai', apiKey: 'k' }] as any, STORE_PATH);
			const chunk = (path: string) => ({ chunk: { id: path, content: path, metadata: { path, title: path, source: 'vault', timestamp: 1 } }, similarity: 0.9 });
			(manager as any).vectorStore.search = jest.fn(async () => [chunk('Private/secret.md'), chunk('open.md'), chunk('memory://agent')]);

			const sources = await manager.search('query');

			expect(sources.map(source => source.path)).toEqual(['open.md', 'memory://agent']);
		});
	});
});

