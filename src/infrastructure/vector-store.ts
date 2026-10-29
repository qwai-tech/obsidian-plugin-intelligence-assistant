import {App, TFile} from 'obsidian';
import type { RAGConfig, LLMConfig } from '@/types';
import { pluginPaths } from '@/core/plugin-paths';
import { JsonFile } from './persistence/json-file';
import { EmbeddingManager } from './embedding-manager';
import { stableHash } from '@/utils/file-system';
import { chunkText } from './rag/chunker';

export interface DocumentChunk {
  id: string;
  content: string;
  embedding?: number[];
  metadata: {
    source: string;
    path: string;
    title?: string;
    timestamp: number;
    contentHash?: string;
    embeddingModel?: string;
  };
}

export interface SearchResult {
  chunk: DocumentChunk;
  similarity: number;
}

export interface VectorStoreData {
  _chunks: DocumentChunk[];
  createdAt: number;
  updatedAt: number;
}

export class VectorStore {
	private _chunks: DocumentChunk[] = [];
	private app: App;
	private llmConfigs?: LLMConfig[];
	/**
	 * Cache of each chunk's embedding vector L2 norm, keyed by chunk id.
	 * Chunk embeddings never change once created (re-indexing pushes new ids
	 * or clears the cache), so the norm can be computed once and reused across
	 * queries instead of recomputing sqrt(sum(v^2)) for every chunk per search.
	 * Invalidated wholesale on load/clear/addFile/addContent.
	 */
	private chunkNorms = new Map<string, number>();

  private readonly file: JsonFile<VectorStoreData | null>;

  constructor(app: App, llmConfigs?: LLMConfig[]) {
    this.app = app;
    this.file = new JsonFile<VectorStoreData | null>(app.vault.adapter, pluginPaths(app.vault.configDir).vectorStoreNotes, () => null, 0);
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

  async addFile(file: TFile, config: RAGConfig): Promise<void> {
    await this.load();
    const content = await this.app.vault.read(file);
    const contentHash = stableHash(content);
    const existing = this._chunks.filter(chunk => chunk.id.startsWith(`${file.path}-`));
    if (existing.length > 0 && existing.every(chunk => chunk.metadata.contentHash === contentHash && chunk.metadata.embeddingModel === config.embeddingModel)) {
      return;
    }
    this.chunkNorms.clear();
    
    // Split content into _chunks
    const _chunks = chunkText(content, config);
    
    // Remove existing _chunks for this file
    this._chunks = this._chunks.filter(chunk => !chunk.id.startsWith(`${file.path ?? 'unknown'}-`));

    const batchSize = 10; // Process 10 _chunks at a time
    for (let currentIndex = 0; currentIndex < _chunks.length; currentIndex += batchSize) {
      const batchEnd = Math.min(currentIndex + batchSize, _chunks.length);

      for (let i = currentIndex; i < batchEnd; i++) {
          const chunkId = `${file.path}-${String(i)}`;

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
              const combinedText = `${file.path ?? 'unknown'} ${file.basename ?? ''} ${_chunks[i] ?? ''}`;
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
              path: file.path,
              title: file.basename,
              timestamp: file.stat.mtime,
              contentHash,
              embeddingModel: config.embeddingModel,
            }
          };

          this._chunks.push(chunk);
      }

      if (batchEnd < _chunks.length) {
        await this.yieldToUi(1);
      }
    }

    await this.save();
  }

  /**
   * Remove every chunk belonging to a file path from the in-memory index and
   * persist. Chunk ids are keyed as `${path}-${i}`, so we match on that prefix.
   * Returns the number of chunks removed.
   */
  async removeFile(path: string): Promise<number> {
    await this.load();
    const prefix = `${path}-`;
    const before = this._chunks.length;
    this._chunks = this._chunks.filter(chunk => !chunk.id.startsWith(prefix));
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
  async renameFile(oldPath: string, newPath: string): Promise<number> {
    await this.load();
    const prefix = `${oldPath}-`;
    let renamed = 0;
    for (const chunk of this._chunks) {
      if (chunk.id.startsWith(prefix)) {
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
    console.debug('[VectorStore] Search called with query:', query);
    console.debug('[VectorStore] Total _chunks available:', this._chunks.length);
    console.debug('[VectorStore] Embedding model:', embeddingModel);

    // Generate embedding for the query
    const queryEmbedding = await this.generateEmbedding(query, embeddingModel);
    console.debug('[VectorStore] Query embedding generated:', queryEmbedding ? 'Yes' : 'No');

    if (!queryEmbedding) {
      // Fallback to simple similarity search if embeddings are not available
      console.debug('[VectorStore] Falling back to simple search');
      return this.simpleSearch(query, config);
    }

    // Precompute the query norm once; chunk norms are cached across queries.
    const queryNorm = Math.sqrt(queryEmbedding.reduce((sum, value) => sum + value * value, 0));

    // Calculate similarity with all _chunks
    const comparable = this._chunks.filter(chunk => chunk.metadata.embeddingModel
      ? chunk.metadata.embeddingModel === embeddingModel
      : !chunk.embedding || chunk.embedding.length === queryEmbedding.length);
    let unembeddedCount = 0;
    let similarities: SearchResult[] = comparable.map(chunk => {
      const chunkEmbedding = chunk.embedding;

      if (!chunkEmbedding) {
        // This chunk has no embedding (both embedding attempts failed at index
        // time, e.g. no embedding model configured or a transient provider
        // error). It cannot be scored semantically, so it ranks last with 0
        // similarity and is dropped by any positive similarityThreshold.
        // Re-indexing the file restores its embedding.
        unembeddedCount++;
        return { chunk, similarity: 0 };
      }

      // Calculate content similarity (reuses cached chunk norm).
      const contentSimilarity = this.cosineSimilarityCached(queryEmbedding, queryNorm, chunk);

      // Calculate path/title similarity for boosting
      const lowerPath = chunk.metadata.path.toLowerCase();
      const lowerTitle = (chunk.metadata.title || '').toLowerCase();
      const lowerQuery = query.toLowerCase();
      const queryWords = lowerQuery.split(/\s+/).filter(word => word.length > 0);
      
      let pathMatches = 0;
      for (const word of queryWords) {
        if (lowerPath.includes(word) || lowerTitle.includes(word)) {
          pathMatches++;
        }
      }
      
      // Boost similarity if there are path/title matches
      let finalSimilarity = contentSimilarity;
      if (pathMatches > 0) {
        // Apply a boost factor for documents where path/title matches the query
        finalSimilarity = Math.min(contentSimilarity + (pathMatches / queryWords.length) * 0.3, 1.0);
      }

      return { chunk, similarity: finalSimilarity };
    });

    if (unembeddedCount > 0) {
      console.warn(
        `[VectorStore] ${unembeddedCount}/${this._chunks.length} chunks have no embedding and were scored 0 ` +
        '(semantic recall degraded). Re-index the affected files to restore them.'
      );
    }

    console.debug('[VectorStore] Calculated similarities for', similarities.length, '_chunks');
    console.debug('[VectorStore] Similarity threshold:', config.similarityThreshold);

    // Apply similarity threshold filter if configured
    if (config.similarityThreshold !== undefined && config.similarityThreshold > 0) {
      similarities = similarities.filter(result => result.similarity >= config.similarityThreshold);
      console.debug('[VectorStore] After threshold filter:', similarities.length, '_chunks');
    }

    // Sort by similarity descending
    similarities.sort((a, b) => b.similarity - a.similarity);
    
    // Apply top K limit
    similarities = similarities.slice(0, config.topK);
    
    
    return similarities;
  }
  

  private cosineSimilarityCached(query: number[], queryNorm: number, chunk: DocumentChunk): number {
    const vec = chunk.embedding;
    if (!vec || vec.length !== query.length) {
      return 0;
    }

    let chunkNorm = this.chunkNorms.get(chunk.id);
    if (chunkNorm === undefined) {
      let sumSquares = 0;
      for (let i = 0; i < vec.length; i++) {
        sumSquares += vec[i] ** 2;
      }
      chunkNorm = Math.sqrt(sumSquares);
      this.chunkNorms.set(chunk.id, chunkNorm);
    }

    if (queryNorm === 0 || chunkNorm === 0) {
      return 0;
    }

    let dotProduct = 0;
    for (let i = 0; i < vec.length; i++) {
      dotProduct += query[i] * vec[i];
    }

    return dotProduct / (queryNorm * chunkNorm);
  }

  private async simpleSearch(query: string, config: RAGConfig): Promise<SearchResult[]> {
    // Simple keyword-based search as fallback - enhanced to include path and filename
    let results: SearchResult[] = this._chunks.map(chunk => {
      // Calculate a basic similarity score based on keyword matches in content, path, and title
      const lowerContent = chunk.content.toLowerCase();
      const lowerPath = chunk.metadata.path.toLowerCase();
      const lowerTitle = (chunk.metadata.title || '').toLowerCase();
      const lowerQuery = query.toLowerCase();
      const words = lowerQuery.split(/\s+/).filter(word => word.length > 0);
      
      let contentMatches = 0;
      let pathMatches = 0;
      
      for (const word of words) {
        // Count matches in content
        if (lowerContent.includes(word)) {
          contentMatches++;
        }
        // Count matches in path
        if (lowerPath.includes(word)) {
          pathMatches++;
        }
        // Count matches in title
        if (lowerTitle.includes(word)) {
          pathMatches++; // Give title matches same weight as path matches
        }
      }
      
      // Calculate similarity score with higher weight for path/title matches
      let similarity = 0;
      if (pathMatches > 0) {
        // If path/title matches, give higher score
        similarity = pathMatches / words.length + 0.5; // Boost for path matches
      } else {
        // Only content matches
        similarity = contentMatches / words.length;
      }
      
      // Ensure similarity doesn't exceed 1
      similarity = Math.min(similarity, 1.0);

      return {
        chunk,
        similarity
      };
    }).sort((a, b) => b.similarity - a.similarity);
    
    // Apply similarity threshold filter if configured
    if (config.similarityThreshold !== undefined && config.similarityThreshold > 0) {
      results = results.filter(result => result.similarity >= config.similarityThreshold);
    }
    
    // Apply top K limit
    results = results.slice(0, config.topK);
    
    return Promise.resolve(results);
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
