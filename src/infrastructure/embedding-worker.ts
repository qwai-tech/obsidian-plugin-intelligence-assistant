// embedding-worker.ts - Web Worker for embedding computation

// This is a Web Worker that handles embedding computations in a separate thread
// to prevent blocking the main UI thread

interface EmbeddingRequest {
  id: string;
  text: string;
  dimensions: number;
}

interface EmbeddingResponse {
  id: string;
  success: boolean;
  embedding?: number[];
  error?: string;
}

// Create a simple placeholder embedding algorithm that runs in the worker
function createPlaceholderEmbedding(text: string, dimensions: number): number[] {
  // Validate dimensions
  if (!dimensions || dimensions <= 0 || dimensions > 10000) {
    dimensions = 384;
  }

  // Simple text encoding (since TextEncoder is not available in workers)
  // We'll create a simple hash-based approach in the worker
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // Create embedding array
  const embedding: number[] = new Array(dimensions) as number[];
  for (let i = 0; i < dimensions; i++) {
    const value = Math.sin(hash + i) * Math.cos(hash + i * 2);
    embedding[i] = value;
  }

  // Normalize the vector
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude === 0) {
    const normalized: number[] = new Array(dimensions).fill(0) as number[];
    if (dimensions > 0) normalized[0] = 1;
    return normalized;
  }
  return embedding.map(val => val / magnitude || 0);
}

// Handle messages from the main thread
self.onmessage = function(e: MessageEvent<EmbeddingRequest>) {
  const request = e.data;
  
  try {
    const embedding = createPlaceholderEmbedding(request.text, request.dimensions);
    
    const response: EmbeddingResponse = {
      id: request.id,
      success: true,
      embedding: embedding
    };
    
    self.postMessage(response);
  } catch (error) {
    const response: EmbeddingResponse = {
      id: request.id,
      success: false,
      error: (error as Error).message
    };
    
    self.postMessage(response);
  }
};
export {};
