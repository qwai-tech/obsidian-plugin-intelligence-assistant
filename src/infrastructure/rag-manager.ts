import { App, TFile, Vault, Notice } from 'obsidian';
import type { RAGConfig, LLMConfig } from '@/types';
import { VectorStore, SearchResult } from './vector-store';
import { EmbeddingManager } from './embedding-manager';
import { DocumentGrader, DocumentGrade } from './document-grader';

export class RAGManager {
  private vectorStore: VectorStore;
  private app: App;
  private config: RAGConfig;
  private llmConfigs: LLMConfig[];
  private documentGrader: DocumentGrader;
  private fileChangeListener: ((file: TFile) => void) | null = null;
  private initialized: boolean = false;
  private getChatModel?: () => string | null;
  private getDefaultModel?: () => string | undefined;

  constructor(app: App, config: RAGConfig, llmConfigs: LLMConfig[], getChatModel?: () => string | null, getDefaultModel?: () => string | undefined) {
    this.app = app;
    this.config = config;
    this.llmConfigs = llmConfigs;
    this.getChatModel = getChatModel;
    this.getDefaultModel = getDefaultModel;
    this.vectorStore = new VectorStore(app);
    // Pass functions that can retrieve current values dynamically
    this.documentGrader = new DocumentGrader(
      config,
      llmConfigs,
      () => {
        // Dynamically get the current chat model when needed
        if (this.getChatModel) {
          return this.getChatModel();
        }
        return null;
      },
      () => {
        // Dynamically get the current default model when needed
        if (this.getDefaultModel) {
          return this.getDefaultModel();
        }
        return undefined;
      }
    );
  }

  async initialize(): Promise<void> {
    // Load persisted vector store data
    await this.vectorStore.load();
    
    // Initialize embedding worker for background processing
    EmbeddingManager.initializeWorker();
    
    // Setup file change listener if enabled
    if (this.config.enabled && this.config.embedChangedFiles) {
      this.setupFileChangeListener();
    }
    
    this.initialized = true;
  }

  async indexVault(): Promise<void> {
    // Index all markdown files in the vault
    const files = this.app.vault.getMarkdownFiles();
    
    if (files.length === 0) {
      new Notice('ℹ️ No markdown files found to index for RAG');
      return;
    }
    
    console.log(`Indexing ${files.length} files for RAG...`);
    new Notice(`🔄 Starting RAG indexing for ${files.length} documents...`);
    
    // Process files in batches to avoid blocking the UI
    return new Promise(async (resolve, reject) => {
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
          new Notice(`🔄 RAG indexing progress: ${currentIndex}/${files.length} files...`);
        }
        
        if (currentIndex < files.length) {
          // Schedule next batch after a short delay to allow UI to update
          setTimeout(processBatch, 10); // 10ms delay allows UI to remain responsive
        } else {
          // All files processed
          console.log(`RAG indexing completed. Indexed ${this.vectorStore.getChunkCount()} chunks.`);
          new Notice(`✅ RAG indexing completed! ${successCount} files indexed, ${failureCount} failed.`);
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
    
    await this.vectorStore.addFile(file, this.config);
  }

  async indexContent(content: string, metadata: any): Promise<void> {
    if (!this.config.enabled) {
      return;
    }
    
    await this.vectorStore.addContent(content, metadata, this.config);
  }

  async query(query: string): Promise<SearchResult[]> {
    console.log('[RAG Manager] Query called with:', query);
    console.log('[RAG Manager] Config enabled:', this.config.enabled);
    if (!this.config.enabled) {
      console.log('[RAG Manager] RAG config is disabled, returning empty array');
      return [];
    }

    // Get embedding model from config or use default
    const embeddingModel = this.config.embeddingModel || EmbeddingManager.getDefaultEmbeddingModel().id;
    console.log('[RAG Manager] Using embedding model:', embeddingModel);

    let results = await this.vectorStore.search(query, this.config, embeddingModel);
    console.log('[RAG Manager] Search returned:', results.length, 'results');
    
    // Check if we have any indexed documents, if not suggest embedding
    if (results.length === 0) {
      const stats = await this.vectorStore.getDetailedStats();
      if (stats.chunkCount === 0) {
        console.log('[RAG Manager] No indexed documents found, suggesting user to embed documents');
        new Notice('ℹ️ No indexed documents found. Use "Embed All Documents" command to index your vault for RAG.');
      }
    }
    
    // Apply document grading if enabled
    if (this.config.enableGradingThreshold && results.length > 0) {
      console.log('[RAG Manager] Applying document grading...');
      
      try {
        // Create grade requests for each result
        const gradeRequests = results.map(result => ({
          query: query,
          document: {
            content: result.chunk.content,
            path: result.chunk.metadata.path,
            metadata: result.chunk.metadata
          },
          chunkId: result.chunk.id
        }));
        
        // Grade all documents
        const grades = await this.documentGrader.gradeDocuments(gradeRequests);
        console.log('[RAG Manager] Graded', grades.length, 'documents');
        
        // Filter results based on grades
        const filteredResults = results.filter(result => {
          const grade = grades.find(g => g.chunkId === result.chunk.id);
          return grade ? grade.shouldUse : true; // Include if no grade found
        });
        
        console.log('[RAG Manager] Filtered results from', results.length, 'to', filteredResults.length);
        results = filteredResults;
      } catch (error) {
        console.error('[RAG Manager] Error during document grading:', error);
        new Notice(`⚠️ Document grading error: ${error.message}`);
      }
    }
    
    return results;
  }

  async getRelevantContext(query: string, maxChars?: number): Promise<string> {
    if (!this.config.enabled) {
      return '';
    }
    
    const results = await this.query(query);
    
    if (results.length === 0) {
      return '';
    }

    // Use the configured context window limit if maxChars is not provided
    const contextLimit = maxChars ?? this.config.contextWindowLimit ?? 2000;

    // Combine the most relevant chunks up to the context limit
    let context = '';
    for (const result of results) {
      const chunkText = `Document: ${result.chunk.metadata.path}\nContent: ${result.chunk.content}\n\n`;
      
      if (context.length + chunkText.length > contextLimit) {
        // Add as much as possible without exceeding the limit
        const remainingChars = contextLimit - context.length;
        if (remainingChars > 0) {
          context += chunkText.substring(0, remainingChars);
        }
        break;
      } else {
        context += chunkText;
      }
    }
    
    return context;
  }

  async refreshIndex(): Promise<void> {
    new Notice('🔄 Clearing RAG index...');
    this.vectorStore.clear();
    if (this.config.enabled) {
      await this.indexVault();
    } else {
      new Notice('✅ RAG index cleared');
    }
  }

  async clearIndex(): Promise<void> {
    new Notice('🔄 Clearing RAG index...');
    this.vectorStore.clear();
    await this.vectorStore.save();
    new Notice('✅ RAG index cleared');
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

  private async getStoredChunks(): Promise<any[]> {
    return this.vectorStore.getStoredChunks();
  }

  private setupFileChangeListener(): void {
    // Remove any existing listener
    this.removeFileChangeListener();
    
    // Create new listener
    this.fileChangeListener = async (file: TFile) => {
      if (this.config.enabled && this.config.embedChangedFiles && file.extension === 'md') {
        console.log(`File changed: ${file.path}, re-indexing for RAG...`);
        try {
          await this.indexFile(file);
          console.log(`Successfully re-indexed ${file.path}`);
          // Send notification for successful indexing
          if (this.config.indexingMode !== 'manual') { // Only show for automatic indexing
            new Notice(`🔄 RAG: Indexed ${file.basename}`);
          }
        } catch (error) {
          console.error(`Failed to re-index file ${file.path}:`, error);
          new Notice(`❌ RAG: Failed to index ${file.basename} - ${error.message}`);
        }
      }
    };
    
    // Register the listener with the vault
    this.app.vault.on('modify', this.fileChangeListener);
  }

  private removeFileChangeListener(): void {
    if (this.fileChangeListener) {
      this.app.vault.off('modify', this.fileChangeListener);
      this.fileChangeListener = null;
    }
  }

  updateConfig(config: RAGConfig, llmConfigs?: LLMConfig[], getDefaultModel?: () => string | undefined, getChatModel?: () => string | null): void {
    const wasEmbeddingChangedFiles = this.config.embedChangedFiles;
    this.config = config;

    // Update llmConfigs if provided
    if (llmConfigs) {
      this.llmConfigs = llmConfigs;
    }

    // Update getDefaultModel if provided
    if (getDefaultModel !== undefined) {
      this.getDefaultModel = getDefaultModel;
    }

    // Update getChatModel if provided
    if (getChatModel !== undefined) {
      this.getChatModel = getChatModel;
    }

    // Recreate DocumentGrader with new config, llmConfigs, and defaultModel getter
    // This ensures that grader prompt, model source, and other settings take effect immediately
    this.documentGrader = new DocumentGrader(
      this.config,
      this.llmConfigs,
      () => {
        // Dynamically get the current chat model when needed
        if (this.getChatModel) {
          return this.getChatModel();
        }
        return null;
      },
      () => {
        // Dynamically get the current default model when needed
        if (this.getDefaultModel) {
          return this.getDefaultModel();
        }
        return undefined;
      }
    );

    if (!config.enabled) {
      this.vectorStore.clear();
    }

    // Handle file change listener based on new config
    if (config.embedChangedFiles && !wasEmbeddingChangedFiles) {
      // Enable file change listener
      this.setupFileChangeListener();
    } else if (!config.embedChangedFiles && wasEmbeddingChangedFiles) {
      // Disable file change listener
      this.removeFileChangeListener();
    }
  }

  async destroy(): Promise<void> {
    // Clean up listeners when destroying the manager
    this.removeFileChangeListener();
    
    // Clean up the embedding worker
    EmbeddingManager.cleanup();
  }
}
