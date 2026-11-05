import { runtimeClock } from '@qwai/obsidian-llm';
import type {App, TFile} from 'obsidian';
import type { RAGConfig, RetrievalScope, MemoryWriteOptions } from '@/features/knowledge';
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
	private memories: DocumentChunk[] = [];
	private sessionMemories: DocumentChunk[] = [];
	private readonly memoryFile: JsonFile<DocumentChunk[]>;
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
  private readonly lifecycle = new AbortController();

  constructor(app: App, filePath: string, llmConfigs: LLMConfig[] = [], private storageMode = 'disk') {
    this.app = app;
    this.file = new JsonFile<VectorStoreData | null>(app.vault.adapter, filePath, () => null, 0);
    this.llmConfigs = llmConfigs;
    this.memoryFile = new JsonFile(app.vault.adapter, `${filePath}.agent-memory.json`, () => [], 0);
  }

	private loading: Promise<void> | null = null;

	load(): Promise<void> {
		this.loading ??= this.readFromDisk();
		return this.loading;
	}

	setStorageMode(mode: string): void {
		if (mode === this.storageMode) return;
		this.storageMode = mode;
		if (mode === 'disk') void this.save(true).catch(error => console.error('Vector index persistence failed:', error));
	}

	setLlmConfigs(llmConfigs: LLMConfig[]): void {
		this.llmConfigs = llmConfigs;
	}

	async destroy(): Promise<void> {
    this.lifecycle.abort(new Error('Index service stopped'));
    await this.flush();
  }

	async flush(): Promise<void> {
    await Promise.all([...this.indexing.values()]);
		if (this.saveTimeout) {
			await this.save(true);
		}
	}

	private async readFromDisk(): Promise<void> {
		this.chunkNorms.clear();
		const stored = this.storageMode === 'disk' ? await this.file.read() : null;
		const legacy = Array.isArray(stored?._chunks) ? stored._chunks : [];
		this._chunks = legacy.filter(chunk => !chunk.metadata.path.startsWith('memory://') && !chunk.metadata.agentId && chunk.metadata.source !== 'agent-memory');
		const savedMemory = await this.memoryFile.read();
		this.memories = savedMemory.filter(chunk => chunk.metadata.agentId && chunk.metadata.entryId && chunk.metadata.embeddingModel !== undefined);
	}

	private saveTimeout: ReturnType<typeof runtimeClock.schedule> | null = null;

	async save(immediate = false): Promise<void> {
		if (this.saveTimeout) {
			runtimeClock.cancel(this.saveTimeout);
			this.saveTimeout = null;
		}

		if (this.storageMode !== 'disk') return;
		if (immediate) {
			await this.performSave();
		} else {
			this.saveTimeout = runtimeClock.schedule(() => {
				void this.performSave().catch(error => console.error('Vector index persistence failed:', error));
				this.saveTimeout = null;
			}, 1000);
		}
	}

	private async performSave(): Promise<void> {
		if (this.storageMode !== 'disk') return;
		await this.file.write({ _chunks: this._chunks, createdAt: this._chunks.reduce((earliest, chunk) => Math.min(earliest, chunk.metadata.timestamp), Date.now()), updatedAt: Date.now() });
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

    const batchSize = Math.max(1, Math.min(100, Math.floor(config.embeddingBatchSize || 10)));
    for (let currentIndex = 0; currentIndex < _chunks.length; currentIndex += batchSize) {
      const batchEnd = Math.min(currentIndex + batchSize, _chunks.length);

      this.lifecycle.signal.throwIfAborted();
      const batch = await Promise.all(_chunks.slice(currentIndex, batchEnd).map(async (content, offset): Promise<DocumentChunk> => ({
        id: `${path}-${currentIndex + offset}`, content,
        embedding: await this.generateEmbedding(content, config.embeddingModel || undefined, this.lifecycle.signal, true),
        metadata: { source: 'file', path, title: file.basename, timestamp: file.stat.mtime, contentHash, embeddingModel: config.embeddingModel },
      })));
      fresh.push(...batch);

      if (batchEnd < _chunks.length) {
        await this.yieldToUi(1);
      }
    }

    this.lifecycle.signal.throwIfAborted();
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

  async addContent(content: string, rawMetadata: unknown, config: RAGConfig, options: MemoryWriteOptions = {}): Promise<void> {
    const metadata = rawMetadata as { agentId?: string; path?: string; title?: string };
    if (!metadata.agentId) throw new Error('Memory indexing requires an agent owner');
    const owner = metadata.agentId;
    return this.enqueue(`memory:${owner}`, async () => {
      await this.load();
      const signal = options.signal ? AbortSignal.any([options.signal, this.lifecycle.signal]) : this.lifecycle.signal;
      signal.throwIfAborted();
      const mode = options.mode ?? 'long-term';
      const entryId = `${owner}:${await contentDigest(content)}`;
      const pieces = chunkText(content, config);
      const fresh: DocumentChunk[] = [];
      for (let i = 0; i < pieces.length; i++) {
        fresh.push({ id: `memory:${entryId}:${i}`, content: pieces[i], embedding: await this.generateEmbedding(pieces[i], config.embeddingModel || undefined, signal, true), metadata: {
          source: 'agent-memory', agentId: owner, entryId, memoryMode: mode, path: metadata.path || `memory://${owner}`, title: metadata.title,
          timestamp: Date.now(), embeddingModel: config.embeddingModel || '', contentHash: stableHash(content),
        } });
      }
      const current = mode === 'short-term' ? this.sessionMemories : this.memories;
      const updated = [...current.filter(chunk => chunk.metadata.entryId !== entryId), ...fresh];
      const entries = [...new Set(updated.filter(chunk => chunk.metadata.agentId === owner).map(chunk => chunk.metadata.entryId))];
      const keep = new Set(entries.slice(-Math.max(1, Math.min(1000, options.maxEntries ?? 50))));
      const retained = updated.filter(chunk => chunk.metadata.agentId !== owner || keep.has(chunk.metadata.entryId));
      signal.throwIfAborted();
      if (mode === 'short-term') this.sessionMemories = retained;
      else { await this.memoryFile.write(retained); this.memories = retained; }
      this.chunkNorms.clear();
    });
  }

  private async yieldToUi(delayMs: number): Promise<void> {
    await new Promise<void>(resolve => runtimeClock.schedule(resolve, delayMs));
  }

  async search(query: string, config: RAGConfig, embeddingModel?: string, scope: RetrievalScope = {}): Promise<SearchResult[]> {
    await this.load();
    scope.signal?.throwIfAborted();
    const memory = scope.memoryMode === 'short-term' ? this.sessionMemories : scope.memoryMode === 'long-term' ? this.memories : [];
    const candidates = [...this._chunks, ...memory.filter(chunk => Boolean(scope.agentId) && chunk.metadata.agentId === scope.agentId)];
    const queryEmbedding = await this.generateEmbedding(query, embeddingModel, scope.signal);
    scope.signal?.throwIfAborted();
    if (!queryEmbedding) {
      return rankResults(candidates.map(chunk => ({ chunk, similarity: keywordSimilarity(query, chunk) })), config);
    }

    const queryNorm = vectorNorm(queryEmbedding);
    const comparable = candidates.filter(chunk => !chunk.embedding || chunk.metadata.embeddingModel === embeddingModel);
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

  private async generateEmbedding(text: string, embeddingModel?: string, signal?: AbortSignal, strict = false): Promise<number[] | undefined> {
    try {
      if (!embeddingModel) {
        return undefined;
      }
      return await EmbeddingManager.generateEmbedding(text, embeddingModel, this.llmConfigs, signal);
    } catch (error) {
      signal?.throwIfAborted();
      if (strict) throw error;
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

async function contentDigest(content: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
