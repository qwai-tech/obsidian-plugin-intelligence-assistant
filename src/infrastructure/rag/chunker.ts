import type { RAGConfig } from '@/types';

export function chunkText(content: string, config: RAGConfig): string[] {
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
  
  // Use the configured chunking strategy
  switch (config.chunkingStrategy || 'sentence') {
    case 'paragraph':
      return chunkByParagraph(content, config);
    case 'fixed':
      return chunkByFixedLength(content, config);
    case 'semantic':
      return chunkBySemantic(content, config);
    case 'sentence':
    default:
      return chunkBySentence(content, config);
  }
}

function chunkBySentence(content: string, config: RAGConfig): string[] {
  let _chunks: string[] = [];
  
  // Protect against empty or invalid content
  if (!content || content.trim().length === 0) {
    return _chunks;
  }
  
  const sentences = content.split(/(?<=[.!?])\s+/g);
  
  // Protect against invalid sentence splitting
  if (sentences.length === 0 || (sentences.length === 1 && sentences[0].length === 0)) {
    // Fallback to character-based splitting if sentence splitting fails
    return splitLongText(content, config);
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
        const subChunks = splitLongText(sentence, config);
        
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
    _chunks = applyOverlap(_chunks, config.chunkOverlap || 0);
  } catch (error) {
    console.error('Error applying overlap, returning _chunks without overlap:', error);
    // Return _chunks without overlap if there's an error
  }
  
  return _chunks;
}

function chunkByParagraph(content: string, config: RAGConfig): string[] {
  let _chunks: string[] = [];
  
  // Protect against empty or invalid content
  if (!content || content.trim().length === 0) {
    return _chunks;
  }
  
  const paragraphs = content.split(/\n\s*\n/);
  
  // Protect against invalid paragraph splitting
  if (paragraphs.length === 0 || (paragraphs.length === 1 && paragraphs[0].length === 0)) {
    // Fallback to sentence-based splitting if paragraph splitting fails
    return chunkBySentence(content, config);
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
        const sentenceChunks = chunkBySentence(paragraph, config);
        
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
    _chunks = applyOverlap(_chunks, config.chunkOverlap || 0);
  } catch (error) {
    console.error('Error applying overlap in paragraph chunking, returning _chunks without overlap:', error);
    // Return _chunks without overlap if there's an error
  }
  
  return _chunks;
}

function chunkByFixedLength(content: string, config: RAGConfig): string[] {
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
    return applyOverlap(_chunks, config.chunkOverlap || 0);
  } catch (error) {
    console.error('Error applying overlap in fixed-length chunking, returning _chunks without overlap:', error);
    return _chunks;
  }
}

function chunkBySemantic(content: string, config: RAGConfig): string[] {
  // For semantic chunking, we'll use sentence-based approach but with 
  // more intelligent boundary detection
  // This is a simplified implementation - in a real scenario, this would use 
  // more sophisticated NLP techniques
  
  return chunkBySentence(content, config);
}

function applyOverlap(_chunks: string[], overlap: number): string[] {
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

function splitLongText(text: string, config: RAGConfig): string[] {
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

/**
 * Cosine similarity between a query vector (norm precomputed once by the
 * caller) and a chunk's embedding (norm cached across queries). Equivalent to
 * {@link cosineSimilarity} but avoids recomputing the chunk's norm on every
 * search over a stable index.
 */
