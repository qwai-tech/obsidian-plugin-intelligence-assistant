import { DocumentGrader } from '@/infrastructure/document-grader';
import { ModelManager } from '@/infrastructure/llm/model-manager';
import { ProviderFactory } from '@/infrastructure/llm/provider-factory';
import type { RAGConfig } from '@/types';

jest.mock('@/infrastructure/llm/provider-factory', () => ({
	ProviderFactory: {
		createProvider: jest.fn(),
	},
}));

jest.mock('@/infrastructure/llm/model-manager', () => ({
	ModelManager: {
		findConfigForModelByProvider: jest.fn(),
		getAllAvailableModels: jest.fn(),
	},
}));

const baseConfig: RAGConfig = {
	enabled: true,
	chunkSize: 1000,
	chunkOverlap: 100,
	topK: 5,
	embeddingModel: 'openai:text-embedding-3-small',
	vectorStore: 'memory',
	embedChangedFiles: false,
	similarityThreshold: 0.5,
	relevanceScoreWeight: 0.5,
	searchType: 'semantic',
	maxTokensPerChunk: 1000,
	minChunkSize: 50,
	enableCompression: false,
	embeddingBatchSize: 5,
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
	enableGradingThreshold: true,
	graderModelSource: 'chat',
	graderParallelProcessing: 3,
};

const request = {
	query: 'How does grading work?',
	document: {
		content: 'The grader scores document relevance.',
		path: 'notes/grading.md',
	},
	chunkId: 'chunk-1',
};

describe('DocumentGrader', () => {
	beforeEach(() => {
		(ModelManager.findConfigForModelByProvider as jest.Mock).mockReset();
		(ModelManager.getAllAvailableModels as jest.Mock).mockReset();
		(ProviderFactory.createProvider as jest.Mock).mockReset();

		(ModelManager.findConfigForModelByProvider as jest.Mock).mockReturnValue({
			provider: 'openai',
			apiKey: 'test-key',
		});
		(ProviderFactory.createProvider as jest.Mock).mockReturnValue({
			chat: jest.fn(async () => ({
				content: JSON.stringify({
					relevance: 9,
					accuracy: 8,
					supportQuality: 8,
					shouldUse: true,
					explanation: 'Relevant source',
				}),
			})),
		});
	});

	it('uses the configured grader model when settings select the custom source', async () => {
		(ModelManager.getAllAvailableModels as jest.Mock).mockResolvedValue([
			{ id: 'openai:gpt-4o', provider: 'openai', capabilities: ['chat', 'json_mode'], enabled: true },
			{ id: 'openai:gpt-4o-mini', provider: 'openai', capabilities: ['chat', 'json_mode'], enabled: true },
		]);

		const grader = new DocumentGrader({
			...baseConfig,
			graderModelSource: 'custom',
			graderModel: 'openai:gpt-4o-mini',
		}, [{ provider: 'openai', apiKey: 'test-key' }] as any);

		await grader.gradeDocument(request);

		expect(ModelManager.findConfigForModelByProvider).toHaveBeenCalledWith(
			'openai:gpt-4o-mini',
			expect.any(Array),
		);
	});

	it('falls back to a non-reasoning JSON chat model before reasoning models', async () => {
		(ModelManager.getAllAvailableModels as jest.Mock).mockResolvedValue([
			{ id: 'openai:o3-mini', provider: 'openai', capabilities: ['chat', 'reasoning', 'json_mode'], enabled: true },
			{ id: 'openai:gpt-4o-mini', provider: 'openai', capabilities: ['chat', 'json_mode'], enabled: true },
		]);

		const grader = new DocumentGrader({
			...baseConfig,
			graderModelSource: 'chat',
		}, [{ provider: 'openai', apiKey: 'test-key' }] as any);

		await grader.gradeDocument(request);

		expect(ModelManager.findConfigForModelByProvider).toHaveBeenCalledWith(
			'openai:gpt-4o-mini',
			expect.any(Array),
		);
	});

	it('keeps the document usable when the grader model returns empty content', async () => {
		const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
		(ProviderFactory.createProvider as jest.Mock).mockReturnValue({
			chat: jest.fn(async () => ({ content: '' })),
		});

		const grader = new DocumentGrader(baseConfig, [{ provider: 'openai', apiKey: 'test-key' }] as any);

		const grade = await grader.gradeDocument(request, 'openai:gpt-5');

		expect(grade).toEqual(expect.objectContaining({
			relevance: 5,
			accuracy: 5,
			supportQuality: 5,
			shouldUse: true,
			chunkId: 'chunk-1',
			documentPath: 'notes/grading.md',
		}));
		expect(grade.explanation).toContain('empty response');

		warnSpy.mockRestore();
	});
});
