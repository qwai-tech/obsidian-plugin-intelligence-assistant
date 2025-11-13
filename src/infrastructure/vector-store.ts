import {App, TFile} from 'obsidian';
import type { RAGConfig } from '@/types';
import { VECTOR_STORE_FOLDER, VECTOR_STORE_NOTES_PATH } from '@/constants';
import { ensureFolderExists } from '@/utils/file-system';
import { EmbeddingManager } from './embedding-manager';

export interface DocumentChunk {
  id: string;
  content: string;
  embedding?: number[];
  metadata: {
    source: string;
    path: string;
    title?: string;
    timestamp: number;
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
	private dataPath = VECTOR_STORE_NOTES_PATH;

  constructor(app: App) {
    this.app = app;
  }

	async load(): Promise<void> {
		await this.ensureDataFolder();
		try {
			const data = await this.app.vault.adapter.read(this.dataPath);
			const parsed: VectorStoreData = JSON.parse(data);
			this._chunks = parsed._chunks;
			console.debug(`Loaded ${this._chunks.length} _chunks from persistent storage`);
		} catch (error) {
			console.debug('No existing vector store data found, starting fresh');
			this._chunks = [];
		}
	}

	async save(): Promise<void> {
		await this.ensureDataFolder();
		try {
			const data: VectorStoreData = {
				_chunks: this._chunks,
				createdAt: this._chunks.length > 0 ? Math.min(...this._chunks.map(c => c.metadata.timestamp)) : Date.now(),
				updatedAt: Date.now()
			};
			await this.app.vault.adapter.write(this.dataPath, JSON.stringify(data, null, 2));
			console.debug(`Saved ${this._chunks.length} _chunks to persistent storage`);
		} catch (error) {
			console.error('Error saving vector store:', error);
		}
	}

	private async ensureDataFolder(): Promise<void> {
		await ensureFolderExists(this.app.vault.adapter, VECTOR_STORE_FOLDER);
	}

  async addFile(file: TFile, config: RAGConfig): Promise<void> {
    // Read file content
    const content = await this.app.vault.read(file);
    
    // Split content into _chunks
    const _chunks = this.chunkContent(content, config);
    
    // Remove existing _chunks for this file
    this._chunks = this._chunks.filter(chunk => !chunk.id.startsWith(`${file.path}-`));
    
    // Process _chunks in batches to avoid blocking the UI
    return new Promise(async (resolve, reject) => {
      const batchSize = 10; // Process 10 _chunks at a time
      let currentIndex = 0;
      
      const processChunkBatch = async () => {
        const batchEnd = Math.min(currentIndex + batchSize, _chunks.length);
        
        for (let i = currentIndex; i < batchEnd; i++) {
          const chunkId = `${file.path}-${i}`;
          
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
              const combinedText = `${file.path} ${file.basename} ${_chunks[i]}`;
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
              timestamp: file.stat.mtime
            }
          };
          
          this._chunks.push(chunk);
          currentIndex++;
        }
        
        if (currentIndex < _chunks.length) {
          // Schedule next batch after a short delay to allow UI to update
          setTimeout(processChunkBatch, 1); // 1ms delay allows UI to remain responsive
        } else {
          // All _chunks processed, save to persistent storage
          await this.save();
          resolve();
        }
      };
      
      // Start the first batch
      processChunkBatch().catch(reject);
    });
  }

  async addContent(content: string, metadata: any, config: RAGConfig): Promise<void> {
    // Split content into _chunks
    const _chunks = this.chunkContent(content, config);
    
    // Remove existing _chunks for this content if ID is provided
    if (metadata.id) {
      this._chunks = this._chunks.filter(chunk => !chunk.id.startsWith(`${metadata.id}-`));
    }
    
    // Process _chunks in batches to avoid blocking the UI
    return new Promise(async (resolve, reject) => {
      const batchSize = 10; // Process 10 _chunks at a time
      let currentIndex = 0;
      
      const processChunkBatch = async () => {
        const batchEnd = Math.min(currentIndex + batchSize, _chunks.length);
        
        for (let i = currentIndex; i < batchEnd; i++) {
          const chunkId = `${metadata.id || 'content'}-${i}`;
          
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
          if (!embedding && config.embeddingModel && metadata.path) {
            try {
              const combinedText = `${metadata.path} ${metadata.title || ''} ${_chunks[i]}`;
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
              ...metadata,
              timestamp: Date.now()
            }
          };
          
          this._chunks.push(chunk);
          currentIndex++;
        }
        
        if (currentIndex < _chunks.length) {
          // Schedule next batch after a short delay to allow UI to update
          setTimeout(processChunkBatch, 1); // 1ms delay allows UI to remain responsive
        } else {
          // All _chunks processed, save to persistent storage
          await this.save();
          resolve();
        }
      };
      
      // Start the first batch
      processChunkBatch().catch(reject);
    });
  }

  async search(query: string, config: RAGConfig, embeddingModel?: string): Promise<SearchResult[]> {
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

    // Calculate similarity with all _chunks
    let similarities: SearchResult[] = this._chunks.map(chunk => {
      const chunkEmbedding = chunk.embedding;

      if (!chunkEmbedding) {
        // If chunk doesn't have embedding, generate it on-demand
        return { chunk, similarity: 0 };
      }

      // Calculate content similarity
      const contentSimilarity = this.cosineSimilarity(queryEmbedding, chunkEmbedding);
      
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

    console.debug('[VectorStore] Calculated similarities for', similarities.length, '_chunks');
    console.debug('[VectorStore] Similarity threshold:', config.similarityThreshold);

    // Apply similarity threshold filter if configured
    if (config.similarityThreshold !== undefined && config.similarityThreshold > 0) {
      similarities = similarities.filter(result => result.similarity >= config.similarityThreshold!);
      console.debug('[VectorStore] After threshold filter:', similarities.length, '_chunks');
    }

    // Sort by similarity descending
    similarities.sort((a, b) => b.similarity - a.similarity);
    
    // Apply top K limit
    similarities = similarities.slice(0, config.topK);
    
    // Apply re-ranking if enabled
    if (config.reRankingEnabled) {
      similarities = await this.reRankResults(query, similarities, config);
    }
    
    return similarities;
  }
  
  private async reRankResults(query: string, results: SearchResult[], config: RAGConfig): Promise<SearchResult[]> {
    // Simple re-ranking implementation - in a real implementation, this would use a dedicated re-ranking model
    // For now, we'll just return the results as is, but in a real implementation you would:
    // 1. Use a cross-encoder model to re-score the query-chunk pairs
    // 2. Apply the re-ranking model to get new scores
    // 3. Sort by the new scores
    
    console.debug(`Re-ranking ${results.length} results using ${config.reRankingModel || 'default model'}`);
    
    // In a real implementation, we would call a re-ranking model here
    // For now, just return the results as-is but this is where re-ranking would happen
    return results;
  }

  private chunkContent(content: string, config: RAGConfig): string[] {
    // Protect against extremely large content that could cause memory issues
    const MAX_CONTENT_LENGTH = 10 * 1024 * 1024; // 10MB limit
    if (content && content.length > MAX_CONTENT_LENGTH) {
      console.warn(`Content too large (${content.length} chars), truncating to ${MAX_CONTENT_LENGTH} chars`);
      content = content.substring(0, MAX_CONTENT_LENGTH);
    }
    
    // Also protect against null/undefined content
    if (!content) {
      return [];
    }
    
    const _chunks: string[] = [];
    
    // Use the configured chunking strategy
    switch (config.chunkingStrategy || 'sentence') {
      case 'paragraph':
        return this.chunkByParagraph(content, config);
      case 'fixed':
        return this.chunkByFixedLength(content, config);
      case 'semantic':
        return this.chunkBySemantic(content, config);
      case 'sentence':
      default:
        return this.chunkBySentence(content, config);
    }
  }
  
  private chunkBySentence(content: string, config: RAGConfig): string[] {
    let _chunks: string[] = [];
    
    // Protect against empty or invalid content
    if (!content || content.trim().length === 0) {
      return _chunks;
    }
    
    const sentences = content.split(/(?<=[.!?])\s+/g);
    
    // Protect against invalid sentence splitting
    if (sentences.length === 0 || (sentences.length === 1 && sentences[0].length === 0)) {
      // Fallback to character-based splitting if sentence splitting fails
      return this.splitLongText(content, config);
    }
    
    let currentChunk = '';
    for (const sentence of sentences) {
      // Skip empty sentences
      if (!sentence || sentence.trim().length === 0) {
        continue;
      }
      
      if (currentChunk.length + sentence.length <= config.chunkSize) {
        currentChunk += sentence + ' ';
      } else {
        if (currentChunk.trim().length > 0) {
          // Only add chunk if it meets the minimum size requirement
          if (currentChunk.trim().length >= (config.minChunkSize || 50)) {
            // Protect against pushing too many _chunks
            if (_chunks.length < 10000) {
              _chunks.push(currentChunk.trim());
            } else {
              console.warn('Too many _chunks in chunkBySentence, stopping to prevent memory issues');
              break;
            }
          }
        }
        
        // Handle sentences longer than chunkSize by splitting them
        if (sentence.length > config.chunkSize) {
          const subChunks = this.splitLongText(sentence, config);
          
          // Protect against spreading too many sub-_chunks
          if (_chunks.length + subChunks.length < 10000) {
            _chunks.push(...subChunks);
            currentChunk = subChunks[subChunks.length - 1] || '';
          } else {
            console.warn('Too many sub-_chunks in chunkBySentence, limiting to prevent memory issues');
            const allowedToAdd = 10000 - _chunks.length;
            if (allowedToAdd > 0) {
              _chunks.push(...subChunks.slice(0, allowedToAdd));
            }
            break;
          }
        } else {
          currentChunk = sentence + ' ';
        }
      }
    }
    
    if (currentChunk.trim().length > 0) {
      // Only add final chunk if it meets the minimum size requirement
      if (currentChunk.trim().length >= (config.minChunkSize || 50)) {
        // Protect against pushing too many _chunks
        if (_chunks.length < 10000) {
          _chunks.push(currentChunk.trim());
        } else {
          console.warn('Too many _chunks in final addition, skipping to prevent memory issues');
        }
      }
    }
    
    // Apply overlap with safety check
    try {
      _chunks = this.applyOverlap(_chunks, config.chunkOverlap || 0);
    } catch (error) {
      console.error('Error applying overlap, returning _chunks without overlap:', error);
      // Return _chunks without overlap if there's an error
    }
    
    return _chunks;
  }
  
  private chunkByParagraph(content: string, config: RAGConfig): string[] {
    let _chunks: string[] = [];
    
    // Protect against empty or invalid content
    if (!content || content.trim().length === 0) {
      return _chunks;
    }
    
    const paragraphs = content.split(/\n\s*\n/);
    
    // Protect against invalid paragraph splitting
    if (paragraphs.length === 0 || (paragraphs.length === 1 && paragraphs[0].length === 0)) {
      // Fallback to sentence-based splitting if paragraph splitting fails
      return this.chunkBySentence(content, config);
    }
    
    let currentChunk = '';
    for (const paragraph of paragraphs) {
      // Skip empty paragraphs
      if (!paragraph || paragraph.trim().length === 0) {
        continue;
      }
      
      if (currentChunk.length + paragraph.length <= config.chunkSize) {
        currentChunk += paragraph + '\n\n';
      } else {
        if (currentChunk.trim().length > 0) {
          // Only add chunk if it meets the minimum size requirement
          if (currentChunk.trim().length >= (config.minChunkSize || 50)) {
            // Protect against pushing too many _chunks
            if (_chunks.length < 10000) {
              _chunks.push(currentChunk.trim());
            } else {
              console.warn('Too many _chunks in chunkByParagraph, stopping to prevent memory issues');
              break;
            }
          }
        }
        
        // Handle paragraphs longer than chunkSize by splitting them
        if (paragraph.length > config.chunkSize) {
          const sentenceChunks = this.chunkBySentence(paragraph, config);
          
          // Protect against spreading too many sentence _chunks
          if (_chunks.length + sentenceChunks.length < 10000) {
            _chunks.push(...sentenceChunks);
            currentChunk = sentenceChunks[sentenceChunks.length - 1] || '';
          } else {
            console.warn('Too many sentence _chunks in chunkByParagraph, limiting to prevent memory issues');
            const allowedToAdd = 10000 - _chunks.length;
            if (allowedToAdd > 0) {
              _chunks.push(...sentenceChunks.slice(0, allowedToAdd));
            }
            break;
          }
        } else {
          currentChunk = paragraph + '\n\n';
        }
      }
    }
    
    if (currentChunk.trim().length > 0) {
      // Only add final chunk if it meets the minimum size requirement
      if (currentChunk.trim().length >= (config.minChunkSize || 50)) {
        // Protect against pushing too many _chunks
        if (_chunks.length < 10000) {
          _chunks.push(currentChunk.trim());
        } else {
          console.warn('Too many _chunks in final paragraph addition, skipping to prevent memory issues');
        }
      }
    }
    
    // Apply overlap with safety check
    try {
      _chunks = this.applyOverlap(_chunks, config.chunkOverlap || 0);
    } catch (error) {
      console.error('Error applying overlap in paragraph chunking, returning _chunks without overlap:', error);
      // Return _chunks without overlap if there's an error
    }
    
    return _chunks;
  }
  
  private chunkByFixedLength(content: string, config: RAGConfig): string[] {
    let _chunks: string[] = [];
    
    // Protect against empty or invalid content
    if (!content || content.trim().length === 0) {
      return _chunks;
    }
    
    let start = 0;
    let iterations = 0;
    const MAX_ITERATIONS = Math.ceil(content.length / Math.max(1, config.chunkSize || 1000)) * 2; // Safety limit
    
    while (start < content.length && iterations < MAX_ITERATIONS) {
      iterations++;
      
      let end = start + (config.chunkSize || 1000);
      if (end > content.length) {
        end = content.length;
      }
      
      const chunk = content.substring(start, end);
      
      // Only add chunk if it meets the minimum size requirement and we haven't exceeded limits
      if (chunk && chunk.trim().length >= (config.minChunkSize || 50) && _chunks.length < 10000) {
        _chunks.push(chunk);
      }
      
      // Calculate next start position with proper bounds checking
      const nextStart = end - (config.chunkOverlap || 0);
      
      // Prevent infinite loops by ensuring progress
      if (nextStart <= start) {
        // Fallback to fixed progression to prevent infinite loops
        start = end;
        if (start >= content.length) break;
      } else {
        start = nextStart;
      }
      
      // Ensure start never goes backwards or exceeds content length
      start = Math.max(start, 0);
      if (start >= content.length) break;
    }
    
    // Safety check to prevent returning extremely large arrays
    if (iterations >= MAX_ITERATIONS) {
      console.warn('chunkByFixedLength hit iteration limit, returning partial results');
    }
    
    // Apply overlap with safety check
    try {
      return this.applyOverlap(_chunks, config.chunkOverlap || 0);
    } catch (error) {
      console.error('Error applying overlap in fixed-length chunking, returning _chunks without overlap:', error);
      return _chunks;
    }
  }
  
  private chunkBySemantic(content: string, config: RAGConfig): string[] {
    // For semantic chunking, we'll use sentence-based approach but with 
    // more intelligent boundary detection
    // This is a simplified implementation - in a real scenario, this would use 
    // more sophisticated NLP techniques
    
    return this.chunkBySentence(content, config);
  }
  
  private applyOverlap(_chunks: string[], overlap: number): string[] {
    // Validate inputs
    if (!_chunks || _chunks.length === 0) {
      return [];
    }
    
    if (overlap <= 0 || _chunks.length <= 1) {
      return [..._chunks]; // Return a copy
    }
    
    // Protect against extremely large overlap values that could cause issues
    const maxOverlap = Math.min(overlap, 1000); // Cap overlap at reasonable size
    
    // Create a copy of the array to avoid modifying the original
    const result = [..._chunks];
    
    for (let i = 1; i < result.length; i++) {
      const prevChunk = result[i - 1];
      if (!prevChunk) continue;
      
      const overlapStart = Math.max(0, prevChunk.length - maxOverlap);
      const overlapText = prevChunk.substring(overlapStart);
      
      // Skip if overlap text is empty or too large
      if (!overlapText || overlapText.length > 10000) {
        continue;
      }
      
      // If overlap is significant portion of the current chunk, merge them
      if (overlapText.length > maxOverlap / 2) {
        // Protect against creating extremely large _chunks
        const currentChunk = result[i] || '';
        const combinedChunk = overlapText + ' ' + currentChunk;
        
        // Only proceed if the combined chunk is reasonable in size
        if (combinedChunk.length < 50000) { // Cap at 50KB to prevent memory issues
          result[i] = combinedChunk;
        }
      }
    }
    
    return result;
  }

  private splitLongText(text: string, config: RAGConfig): string[] {
    // Validate and sanitize configuration parameters to prevent invalid array operations
    const chunkSize = Math.max(50, config.chunkSize || 1000); // Minimum 50, default 1000
    const chunkOverlap = Math.max(0, Math.min((config.chunkOverlap || 0), chunkSize - 1)); // Ensure overlap is valid
    const minChunkSize = Math.max(1, config.minChunkSize || 50); // Minimum 1, default 50
    
    // Prevent invalid configurations that could cause infinite loops or invalid array operations
    if (chunkOverlap >= chunkSize) {
      console.warn('Invalid chunkOverlap configuration, setting to 0 to prevent issues');
    }
    
    const _chunks: string[] = [];
    let start = 0;
    let iterations = 0;
    const MAX_ITERATIONS = Math.ceil(text.length / Math.max(1, chunkSize - chunkOverlap)) * 2; // Safety limit
    
    while (start < text.length && iterations < MAX_ITERATIONS) {
      iterations++;
      
      let end = start + chunkSize;
      if (end > text.length) {
        end = text.length;
      }
      
      const chunk = text.substring(start, end);
      
      // Only add chunk if it meets the minimum size requirement
      if (chunk && chunk.length >= minChunkSize) {
        // Check that we're not trying to push an invalid chunk
        if (_chunks.length < 10000) { // Reasonable limit to prevent memory issues
          _chunks.push(chunk);
        } else {
          console.warn('Too many _chunks created, stopping to prevent memory issues');
          break;
        }
      }
      
      // Calculate next start position with proper bounds checking
      const nextStart = end - chunkOverlap;
      
      // Prevent infinite loops by ensuring progress
      if (nextStart <= start) {
        // Fallback to fixed progression to prevent infinite loops
        start = end;
        if (start >= text.length) break;
      } else {
        start = nextStart;
      }
      
      // Ensure start never goes backwards or exceeds text length
      start = Math.max(start, 0);
      if (start >= text.length) break;
    }
    
    // Safety check to prevent returning extremely large arrays
    if (iterations >= MAX_ITERATIONS) {
      console.warn('splitLongText hit iteration limit, returning partial results');
    }
    
    return _chunks;
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      return 0;
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] ** 2;
      normB += vecB[i] ** 2;
    }
    
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
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
      results = results.filter(result => result.similarity >= config.similarityThreshold!);
    }
    
    // Apply top K limit
    results = results.slice(0, config.topK);
    
    return results;
  }

  private async generateEmbedding(text: string, embeddingModel?: string): Promise<number[] | undefined> {
    // This would normally call an embedding API or local model
    // Using the EmbeddingManager to generate the embedding
    
    try {
      // If no embedding model is specified, return undefined to use simple search
      if (!embeddingModel) {
        return undefined;
      }
      
      // Use the EmbeddingManager to generate the embedding
      return await EmbeddingManager.generateEmbedding(text, embeddingModel);
    } catch (error) {
      console.error('Error generating embedding:', error);
      return undefined;
    }
  }

  private simpleHash(data: Uint8Array): number {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data[i];
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  clear(): void {
    this._chunks = [];
    this.save().catch(error => console.error('Failed to persist cleared vector store', error));
  }

  getChunkCount(): number {
    return this._chunks.length;
  }

  getStoredChunks(): DocumentChunk[] {
    return [...this._chunks]; // Return a copy to prevent external modification
  }

  async getDetailedStats(): Promise<{
    chunkCount: number;
    fileCount: number;
    totalSize: number;
    indexedFiles: string[];
  }> {
    const _chunks = this.getStoredChunks();
    const indexedFiles = [...new Set(_chunks.map(chunk => chunk.metadata.path))];
    const totalSize = _chunks.reduce((sum, chunk) => sum + chunk.content.length, 0);

    return {
      chunkCount: _chunks.length,
      fileCount: indexedFiles.length,
      totalSize,
      indexedFiles,
    };
  }
}
