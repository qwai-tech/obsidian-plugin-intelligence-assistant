import {App, TFile} from 'obsidian';
import type { RAGConfig } from '@/features/knowledge';
import type { LLMConfig } from '@/features/llm';
import { JsonFile } from '@/adapters/persistence/json-file';
import { EmbeddingManager } from './embedding-manager';
import { stableHash } from '@/core/utils/file-system';
import { chunkText } from './chunker';
import { boostByPath, cosine, keywordSimilarity, rankResults, vectorNorm } from './similarity';
import type { DocumentChunk, SearchResult } from './rag-types';

export interface VectorStoreData {
  _chunks: DocumentChunk[];
  createdAt: number;
  updatedAt: number;
}

export class VectorStore {
	private _chunks: DocumentChunk[] = [];
	private app: App;
	private llmConfigs: LLMConfig[];
	/**
	 * Cache of each chunk's embedding vector L2 norm, keyed by chunk id.
	 * Chunk embeddings never change once created (re-indexing pushes new ids
	 * or clears the cache), so the norm can be computed once and reused across
	 * queries instead of recomputing sqrt(sum(v^2)) for every chunk per search.
	 * Invalidated wholesale on load/clear/addFile/addContent.
	 */
	private chunkNorms = new Map<string, number>();

  private readonly file: JsonFile<VectorStoreData | null>;
  private readonly indexing = new Map<string, Promise<void>>();

  constructor(app: App, filePath: string, llmConfigs: LLMConfig[] = []) {
    this.app = app;
    this.file = new JsonFile<VectorStoreData | null>(app.vault.adapter, filePath, () => null, 0);
    this.llmConfigs = llmConfigs;
  }

	private loading: Promise<void> | null = null;

	load(): Promise<void> {
		this.loading ??= this.readFromDisk();
		return this.loading;
	}

	setLlmConfigs(llmConfigs: LLMConfig[]): void {
		this.llmConfigs = llmConfigs;
	}

	async flush(): Promise<void> {
		if (this.saveTimeout) {
			await this.save(true);
		}
	}

	private async readFromDisk(): Promise<void> {
		this.chunkNorms.clear();
		const stored = await this.file.read();
		this._chunks = Array.isArray(stored?._chunks) ? stored._chunks : [];
	}

	private saveTimeout: ReturnType<typeof activeWindow.setTimeout> | null = null;

	async save(immediate = false): Promise<void> {
		if (this.saveTimeout) {
			window.clearTimeout(this.saveTimeout);
			this.saveTimeout = null;
		}

		// Always immediate in test environment to avoid race conditions in E2E
		const isTest = typeof process !== 'undefined' && (process.env.NODE_ENV === 'test' || Boolean(process.env.WDIO_WORKER_ID));

		if (immediate || isTest) {
			await this.performSave();
		} else {
			this.saveTimeout = window.setTimeout(() => {
				void this.performSave();
				this.saveTimeout = null;
			}, 1000);
		}
	}

	private async performSave(): Promise<void> {
		try {
			await this.file.write({
				_chunks: this._chunks,
				createdAt: this._chunks.reduce((earliest, chunk) => Math.min(earliest, chunk.metadata.timestamp), Date.now()),
				updatedAt: Date.now(),
			});
		} catch (error) {
			console.error('Error saving vector store:', error);
		}
	}

  addFile(file: TFile, config: RAGConfig): Promise<void> {
    return this.enqueue(file.path, () => this.indexFile(file, config));
  }

  private enqueue<T>(path: string, work: () => Promise<T>): Promise<T> {
    const previous = this.indexing.get(path) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(work);
    const settled = run.then(() => undefined, () => undefined);
    this.indexing.set(path, settled);
    return run.finally(() => {
      if (this.indexing.get(path) === settled) this.indexing.delete(path);
    });
  }

  private async indexFile(file: TFile, config: RAGConfig): Promise<void> {
    await this.load();
    const path = file.path;
    const content = await this.app.vault.read(file);
    const contentHash = stableHash(content);
    const existing = this._chunks.filter(chunk => chunk.metadata.path === path);
    const upToDate = (chunk: DocumentChunk) => chunk.metadata.contentHash === contentHash
      && chunk.metadata.embeddingModel === config.embeddingModel
      && (!config.embeddingModel || chunk.embedding !== undefined);
    if (existing.length > 0 && existing.every(upToDate)) {
      return;
    }
    const _chunks = chunkText(content, config);
    const fresh: DocumentChunk[] = [];

    const batchSize = 10; // Process 10 _chunks at a time
    for (let currentIndex = 0; currentIndex < _chunks.length; currentIndex += batchSize) {
      const batchEnd = Math.min(currentIndex + batchSize, _chunks.length);

      for (let i = currentIndex; i < batchEnd; i++) {
          const chunkId = `${path}-${String(i)}`;

          // Generate embedding for the chunk content
          const embeddingModel = config.embeddingModel;
          let embedding: number[] | undefined;
          if (embeddingModel) {
            try {
              embedding = await this.generateEmbedding(_chunks[i], embeddingModel);
            } catch (error) {
              console.error(`Failed to generate embedding for chunk ${chunkId}:`, error);
            }
          }

          // Create combined text for embedding that includes path info if we don't have an embedding yet
          if (!embedding && config.embeddingModel) {
            try {
              const combinedText = `${path} ${file.basename ?? ''} ${_chunks[i] ?? ''}`;
              embedding = await this.generateEmbedding(combinedText, config.embeddingModel);
            } catch (error) {
              console.error(`Failed to generate combined embedding for chunk ${chunkId}:`, error);
            }
          }

          const chunk: DocumentChunk = {
            id: chunkId,
            content: _chunks[i],
            embedding: embedding,
            metadata: {
              source: 'file',
              path,
              title: file.basename,
              timestamp: file.stat.mtime,
              contentHash,
              embeddingModel: config.embeddingModel,
            }
          };

          fresh.push(chunk);
      }

      if (batchEnd < _chunks.length) {
        await this.yieldToUi(1);
      }
    }

    this._chunks = [...this._chunks.filter(chunk => chunk.metadata.path !== path), ...fresh];
    this.chunkNorms.clear();
    await this.save();
  }

  /**
   * Remove every chunk belonging to a file path from the in-memory index and
   * persist.
   * Returns the number of chunks removed.
   */
  removeFile(path: string): Promise<number> {
    return this.enqueue(path, () => this.dropFile(path));
  }

  private async dropFile(path: string): Promise<number> {
    await this.load();
    const before = this._chunks.length;
    this._chunks = this._chunks.filter(chunk => chunk.metadata.path !== path);
    const removed = before - this._chunks.length;
    if (removed > 0) {
      this.chunkNorms.clear();
      await this.save();
    }
    return removed;
  }

  /**
   * Re-key a file's chunks from `oldPath` to `newPath` without recomputing
   * embeddings (the embedding vectors are unchanged by a rename — only the id /
   * metadata path move). Returns the number of chunks re-keyed.
   */
  renameFile(oldPath: string, newPath: string): Promise<number> {
    return this.enqueue(oldPath, () => this.rekeyFile(oldPath, newPath));
  }

  private async rekeyFile(oldPath: string, newPath: string): Promise<number> {
    await this.load();
    let renamed = 0;
    for (const chunk of this._chunks) {
      if (chunk.metadata.path === oldPath) {
        chunk.id = `${newPath}${chunk.id.slice(oldPath.length)}`;
        chunk.metadata.path = newPath;
        renamed++;
      }
    }
    if (renamed > 0) {
      this.chunkNorms.clear();
      await this.save();
    }
    return renamed;
  }

  async addContent(content: string, metadata: unknown, config: RAGConfig): Promise<void> {
    await this.load();
    // Embeddings (and therefore norms) are about to change; drop the norm cache.
    this.chunkNorms.clear();
    // Split content into _chunks
    const _chunks = chunkText(content, config);

    // Remove existing _chunks for this content if ID is provided
    if ((metadata as { id?: string }).id) {
      this._chunks = this._chunks.filter(chunk => !chunk.id.startsWith(`${(metadata as { id?: string }).id ?? ''}-`));
    }

    const batchSize = 10; // Process 10 _chunks at a time
    for (let currentIndex = 0; currentIndex < _chunks.length; currentIndex += batchSize) {
      const batchEnd = Math.min(currentIndex + batchSize, _chunks.length);

      for (let i = currentIndex; i < batchEnd; i++) {
          const chunkId = `${(metadata as { id?: string }).id ?? 'content'}-${String(i)}`;

          // Generate embedding for the chunk content
          const embeddingModel = config.embeddingModel;
          let embedding: number[] | undefined;
          if (embeddingModel) {
            try {
              embedding = await this.generateEmbedding(_chunks[i], embeddingModel);
            } catch (error) {
              console.error(`Failed to generate embedding for chunk ${chunkId}:`, error);
            }
          }

          // Create combined text for embedding that includes path/filename info if we don't have an embedding yet
          if (!embedding && config.embeddingModel && (metadata as { path?: string }).path) {
            try {
              const combinedText = `${(metadata as { path?: string }).path ?? ''} ${(metadata as { title?: string }).title ?? ''} ${_chunks[i] ?? ''}`;
              embedding = await this.generateEmbedding(combinedText, config.embeddingModel);
            } catch (error) {
              console.error(`Failed to generate combined embedding for chunk ${chunkId}:`, error);
            }
          }

          const chunk: DocumentChunk = {
            id: chunkId,
            content: _chunks[i],
            embedding: embedding,
            metadata: {
              ...(metadata as Record<string, unknown>),
              timestamp: Date.now()
            } as DocumentChunk['metadata']
          };

          this._chunks.push(chunk);
      }

      if (batchEnd < _chunks.length) {
        await this.yieldToUi(1);
      }
    }

    await this.save();
  }

  private async yieldToUi(delayMs: number): Promise<void> {
    const timerHost = typeof activeWindow !== 'undefined' ? activeWindow : window;
    await new Promise<void>(resolve => timerHost.setTimeout(resolve, delayMs));
  }

  async search(query: string, config: RAGConfig, embeddingModel?: string): Promise<SearchResult[]> {
    await this.load();
    const queryEmbedding = await this.generateEmbedding(query, embeddingModel);
    if (!queryEmbedding) {
      return rankResults(this._chunks.map(chunk => ({ chunk, similarity: keywordSimilarity(query, chunk) })), config);
    }

    const queryNorm = vectorNorm(queryEmbedding);
    const comparable = this._chunks.filter(chunk => chunk.metadata.embeddingModel
      ? chunk.metadata.embeddingModel === embeddingModel
      : !chunk.embedding || chunk.embedding.length === queryEmbedding.length);
    const unembedded = comparable.filter(chunk => !chunk.embedding).length;
    if (unembedded > 0) {
      console.warn(
        `[VectorStore] ${unembedded}/${this._chunks.length} chunks have no embedding and were scored 0 ` +
        '(semantic recall degraded). Re-index the affected files to restore them.'
      );
    }

    return rankResults(comparable.map(chunk => ({
      chunk,
      similarity: chunk.embedding
        ? boostByPath(cosine(queryEmbedding, queryNorm, chunk.embedding, this.normOf(chunk, chunk.embedding)), query, chunk)
        : 0,
    })), config);
  }

  private normOf(chunk: DocumentChunk, embedding: number[]): number {
    let norm = this.chunkNorms.get(chunk.id);
    if (norm === undefined) {
      norm = vectorNorm(embedding);
      this.chunkNorms.set(chunk.id, norm);
    }
    return norm;
  }

  private async generateEmbedding(text: string, embeddingModel?: string): Promise<number[] | undefined> {
    try {
      if (!embeddingModel) {
        return undefined;
      }
      return await EmbeddingManager.generateEmbedding(text, embeddingModel, this.llmConfigs);
    } catch (error) {
      console.error('Error generating embedding:', error);
      return undefined;
    }
  }

  clear(): void {
    this.loading = Promise.resolve();
    this._chunks = [];
    this.chunkNorms.clear();
    this.save(true).catch(error => console.error('Failed to persist cleared vector store', error));
  }

  getChunkCount(): number {
    return this._chunks.length;
  }

  getStoredChunks(): DocumentChunk[] {
    return [...this._chunks]; // Return a copy to prevent external modification
  }

  getDetailedStats(): {
    chunkCount: number;
    fileCount: number;
    totalSize: number;
    indexedFiles: string[];
    unembeddedChunkCount: number;
  } {
    const _chunks = this.getStoredChunks();
    const indexedFiles = [...new Set(_chunks.map(chunk => chunk.metadata.path))];
    const totalSize = _chunks.reduce((sum, chunk) => sum + chunk.content.length, 0);
    const unembeddedChunkCount = _chunks.reduce((count, chunk) => count + (chunk.embedding ? 0 : 1), 0);

    return {
      chunkCount: _chunks.length,
      fileCount: indexedFiles.length,
      totalSize,
      indexedFiles,
      unembeddedChunkCount,
    };
  }
}
