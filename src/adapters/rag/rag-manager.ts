import { App, TFile, Notice, getAllTags } from 'obsidian';
import { isIndexable } from '@/core/rag-index-filter';
import type { RAGConfig, RAGSource } from '@/features/knowledge';
import { fitContextBudget } from './context-budget';
import type { LLMConfig } from '@/features/llm';
import { VectorStore } from './vector-store';
import type { SearchResult } from './rag-types';
import { EmbeddingManager } from './embedding-manager';
import { DocumentGrader } from './document-grader';
import { errorMessage } from '@/core/utils/errors';
import { t } from '@/i18n';

export class RAGManager {
  private vectorStore: VectorStore;
  private app: App;
  private config: RAGConfig;
  private llmConfigs: LLMConfig[];
  private documentGrader: DocumentGrader;
  constructor(app: App, config: RAGConfig, llmConfigs: LLMConfig[], vectorStorePath: string) {
    this.app = app;
    this.config = config;
    this.llmConfigs = llmConfigs;
    this.vectorStore = new VectorStore(app, vectorStorePath, llmConfigs);
    this.documentGrader = new DocumentGrader(config, llmConfigs);
  }

  async initialize(): Promise<void> {
    await this.vectorStore.load();
  }

  async indexVault(): Promise<void> {
    const files = this.app.vault.getMarkdownFiles().filter(file => this.isIndexable(file));
    
    if (files.length === 0) {
      new Notice(t('rag.notices.noFiles'));
      return;
    }
    
    new Notice(t('rag.notices.starting', { count: files.length }));
    
    // Process files in batches to avoid blocking the UI
    return new Promise((resolve, reject) => {
      const batchSize = 5; // Process 5 files at a time
      let currentIndex = 0;
      let successCount = 0;
      let failureCount = 0;
      
      const processBatch = async () => {
        const batchEnd = Math.min(currentIndex + batchSize, files.length);
        
        for (let i = currentIndex; i < batchEnd; i++) {
          const file = files[i];
          try {
            await this.indexFile(file);
            successCount++;
          } catch (error) {
            console.error(`Failed to index file ${file.path}:`, error);
            failureCount++;
          }
          
          currentIndex++;
        }
        
        // Update progress every 10 files or at the end
        if (currentIndex % 10 === 0 || currentIndex === files.length) {
          new Notice(t('rag.notices.progress', { done: currentIndex, total: files.length }));
        }
        
        if (currentIndex < files.length) {
          // Schedule next batch after a short delay to allow UI to update
          window.setTimeout(() => {
            processBatch().catch(reject);
          }, 10); // 10ms delay allows UI to remain responsive
        } else {
          // All files processed
          new Notice(t('rag.notices.completed', { indexed: successCount, failed: failureCount }));
          resolve();
        }
      };
      
      // Start the first batch immediately
      processBatch().catch(reject);
    });
  }

  async indexFile(file: TFile): Promise<void> {
    if (!this.config.enabled) {
      return;
    }
    if (!this.isIndexable(file)) {
      await this.vectorStore.removeFile(file.path);
      return;
    }
    await this.vectorStore.addFile(file, this.config);
  }

  private isIndexable(file: TFile): boolean {
    const cache = this.app.metadataCache.getFileCache(file);
    return isIndexable({ path: file.path, extension: file.extension, tags: (cache && getAllTags(cache)) ?? [] }, this.config);
  }

  private isStillIndexable(path: string): boolean {
    const file = this.app.vault.getFileByPath(path);
    return file === null || this.isIndexable(file);
  }

  /**
   * Incrementally drop a single deleted file from the index. No-op when RAG is
   * disabled. Returns the number of chunks removed.
   */
  async removeFile(path: string): Promise<number> {
    if (!this.config.enabled) {
      return 0;
    }
    return await this.vectorStore.removeFile(path);
  }

  /**
   * Incrementally re-key a renamed/moved file's chunks instead of re-embedding.
   * No-op when RAG is disabled. Returns the number of chunks re-keyed.
   */
  async renameFile(oldPath: string, newPath: string): Promise<number> {
    if (!this.config.enabled) {
      return 0;
    }
    return await this.vectorStore.renameFile(oldPath, newPath);
  }

  async indexMemory(agentId: string, content: string): Promise<void> {
    if (!this.config.enabled) {
      return;
    }
    
    await this.vectorStore.addContent(content, {
      type: 'agent-memory',
      agentId,
      path: `memory://${agentId}`,
      title: `Memory: ${agentId}`
    }, this.config);
  }

  async search(query: string, chatModel?: string, defaultModel?: string): Promise<RAGSource[]> {
    const results = await this.query(query, chatModel, defaultModel);
    return fitContextBudget(results.map(result => ({
      path: result.chunk.metadata.path,
      content: result.chunk.content,
      similarity: result.similarity,
      title: result.chunk.metadata.title,
    })), this.config.contextWindowLimit);
  }

  private async query(query: string, chatModel?: string, defaultModel?: string): Promise<SearchResult[]> {
    if (!this.config.enabled) {
      return [];
    }

    // Get embedding model from config or use default
    const embeddingModel = this.config.embeddingModel || EmbeddingManager.getDefaultEmbeddingModel().id;

    let results = (await this.vectorStore.search(query, this.config, embeddingModel))
      .filter(result => this.isStillIndexable(result.chunk.metadata.path));
    
    // Check if we have any indexed documents, if not suggest embedding
      if (results.length === 0) {
        const stats = this.vectorStore.getDetailedStats();
        if (stats.chunkCount === 0) {
          new Notice(t('rag.notices.noIndex'));
        }
      }
    
    // Apply document grading if enabled
    if (this.config.enableGradingThreshold && results.length > 0) {
      try {
        // Create grade requests for each result
        const gradeRequests = results.map(result => ({
          query: query,
          doc: {
            content: result.chunk.content,
            path: result.chunk.metadata.path,
            metadata: result.chunk.metadata
          },
          chunkId: result.chunk.id
        }));
        
        // Grade all documents
        const grades = await this.documentGrader.gradeDocuments(gradeRequests, chatModel, defaultModel);
        
        // Filter results based on grades
        const filteredResults = results.filter(result => {
          const grade = grades.find(g => g.chunkId === result.chunk.id);
          return grade ? grade.shouldUse : true; // Include if no grade found
        });
        
        results = filteredResults;
      } catch (error) {
        console.error('[RAG Manager] Error during document grading:', error);
        new Notice(t('rag.notices.gradingError', { message: errorMessage(error) }));
      }
    }
    
    return results;
  }

  async refreshIndex(): Promise<void> {
    new Notice(t('rag.notices.clearing'));
    this.vectorStore.clear();
    if (this.config.enabled) {
      await this.indexVault();
    } else {
      new Notice(t('rag.notices.cleared'));
    }
  }

  async clearIndex(): Promise<void> {
    new Notice(t('rag.notices.clearing'));
    this.vectorStore.clear();
    await this.vectorStore.save();
    new Notice(t('rag.notices.cleared'));
  }

  getStats(): { chunkCount: number } {
    return {
      chunkCount: this.vectorStore.getChunkCount()
    };
  }

  async getDetailedStats(): Promise<{
    chunkCount: number;
    fileCount: number;
    totalSize: number;
    indexedFiles: string[];
  }> {
    await this.vectorStore.load();
    return this.vectorStore.getDetailedStats();
  }

  updateConfig(config: RAGConfig, llmConfigs?: LLMConfig[]): void {
    this.config = config;
    if (llmConfigs) {
      this.llmConfigs = llmConfigs;
      this.vectorStore.setLlmConfigs(llmConfigs);
    }
    this.documentGrader = new DocumentGrader(this.config, this.llmConfigs);
  }

  async destroy(): Promise<void> {
    await this.vectorStore.flush();
  }
}
