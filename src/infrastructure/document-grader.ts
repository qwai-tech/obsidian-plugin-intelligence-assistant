import type { LLMConfig, RAGConfig } from '@/types';
import { ModelManager } from '@/infrastructure/llm/model-manager';
import { ProviderFactory } from '@/infrastructure/llm/provider-factory';

export interface DocumentGrade {
  relevance: number; // 0-10 scale
  accuracy: number; // 0-10 scale
  supportQuality: number; // 0-10 scale
  shouldUse: boolean; // Whether to use this document
  explanation: string; // Brief explanation of the evaluation
  chunkId: string; // ID of the chunk being graded
  documentPath: string; // Path of the source document
}

export interface GradeRequest {
  query: string;
  document: {
    content: string;
    path: string;
    metadata?: Record<string, any>;
  };
  chunkId: string;
}

export class DocumentGrader {
  private config: RAGConfig;
  private llmConfigs: LLMConfig[];
  private getChatModelFn?: () => string | null;
  private getDefaultModelFn?: () => string | undefined;

  constructor(
    config: RAGConfig, 
    llmConfigs: LLMConfig[], 
    getChatModelFn?: () => string | null,
    getDefaultModelFn?: () => string | undefined
  ) {
    this.config = config;
    this.llmConfigs = llmConfigs;
    this.getChatModelFn = getChatModelFn;
    this.getDefaultModelFn = getDefaultModelFn;
  }

  async gradeDocument(request: GradeRequest): Promise<DocumentGrade> {
    if (!this.config.enableGradingThreshold) {
      return this.getDefaultGrade(request);
    }

    const graderModel = await this.resolveGraderModel();
    if (!graderModel) {
      console.warn('[DocumentGrader] No grader model available');
      return this.getDefaultGrade(request);
    }

    try {
      const providerConfig = ModelManager.findConfigForModelByProvider(graderModel, this.llmConfigs);
      if (!providerConfig) {
        throw new Error(`No provider configuration found for grader model: ${graderModel}`);
      }

      const provider = ProviderFactory.createProvider(providerConfig);

      const prompt = this.formatPrompt(request);
      const response = await provider.chat({
        messages: [
          {
            role: 'system',
            content: 'You are an expert document evaluator. Respond with a valid JSON object only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        model: graderModel,
        temperature: 0.3,
        maxTokens: 500
      });

      const gradeResult = this.parseResponse(response.content);
      const grade = this.createGrade(gradeResult, request);

      // Apply thresholds
      if (this.config.enableGradingThreshold) {
        grade.shouldUse = this.meetsThresholds(grade);
      }

      return grade;
    } catch (error) {
      console.error('[DocumentGrader] Error grading document:', error);
      return {
        relevance: 5,
        accuracy: 5,
        supportQuality: 5,
        shouldUse: true,
        explanation: `Error during grading: ${error.message}`,
        chunkId: request.chunkId,
        documentPath: request.document.path
      };
    }
  }

  async gradeDocuments(requests: GradeRequest[]): Promise<DocumentGrade[]> {
    if (!this.config.enableGradingThreshold) {
      return requests.map(req => this.getDefaultGrade(req));
    }

    const parallelLimit = Math.min(this.config.graderParallelProcessing || 3, 10);
    const grades: DocumentGrade[] = [];

    for (let i = 0; i < requests.length; i += parallelLimit) {
      const batch = requests.slice(i, i + parallelLimit);
      const batchGrades = await Promise.all(
        batch.map(request => this.gradeDocument(request))
      );
      grades.push(...batchGrades);

      if (i + parallelLimit < requests.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return grades;
  }

  filterDocumentsByGrade(documents: any[], grades: DocumentGrade[]): any[] {
    if (!this.config.enableGradingThreshold) {
      return documents;
    }

    const gradeMap = new Map<string, DocumentGrade>();
    grades.forEach(grade => gradeMap.set(grade.chunkId, grade));

    return documents.filter(doc => {
      const grade = gradeMap.get(doc.id);
      return grade ? grade.shouldUse : true;
    });
  }

  private getDefaultGrade(request: GradeRequest): DocumentGrade {
    return {
      relevance: 8,
      accuracy: 8,
      supportQuality: 8,
      shouldUse: true,
      explanation: 'Grading disabled, using default quality',
      chunkId: request.chunkId,
      documentPath: request.document.path
    };
  }

  private formatPrompt(request: GradeRequest): string {
    const template = this.config.graderPromptTemplate || this.getDefaultPromptTemplate();
    return template
      .replace('{query}', request.query)
      .replace('{document}', request.document.content)
      .replace('{path}', request.document.path || 'unknown');
  }

  private parseResponse(content: string): any {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      return JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch (error) {
      console.error('[DocumentGrader] Failed to parse JSON response:', error);
      throw new Error('Invalid JSON response from model');
    }
  }

  private createGrade(gradeResult: any, request: GradeRequest): DocumentGrade {
    return {
      relevance: this.normalizeScore(gradeResult.relevance),
      accuracy: this.normalizeScore(gradeResult.accuracy),
      supportQuality: this.normalizeScore(gradeResult.supportQuality),
      shouldUse: typeof gradeResult.shouldUse === 'boolean' ? gradeResult.shouldUse : true,
      explanation: typeof gradeResult.explanation === 'string' ? gradeResult.explanation : 'No explanation provided',
      chunkId: request.chunkId,
      documentPath: request.document.path
    };
  }

  private meetsThresholds(grade: DocumentGrade): boolean {
    const minRelevance = this.config.minRelevanceScore || 5;
    const minAccuracy = this.config.minAccuracyScore || 7;
    const minSupportQuality = this.config.minSupportQualityScore || 6;

    return (
      grade.relevance >= minRelevance &&
      grade.accuracy >= minAccuracy &&
      grade.supportQuality >= minSupportQuality
    );
  }

  private getDefaultPromptTemplate(): string {
    return `You are an expert document evaluator. Your task is to assess the relevance and support quality of a document in relation to a given query.

Instructions:
1. Evaluate the document's relevance to the query (0-10 scale)
2. Assess the document's factual accuracy and support quality (0-10 scale)
3. Determine if the document should be used in the response generation (yes/no)

Query: {query}
Document: {document}

Respond with a JSON object in this exact format:
{
  "relevance": 0-10,
  "accuracy": 0-10,
  "supportQuality": 0-10,
  "shouldUse": true/false,
  "explanation": "Brief explanation of your evaluation"
}`;
  }

  private normalizeScore(score: any): number {
    if (typeof score === 'number') {
      return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
    }

    if (typeof score === 'string') {
      const num = parseFloat(score);
      if (!isNaN(num)) {
        return Math.max(0, Math.min(10, Math.round(num * 10) / 10));
      }
    }

    return 5;
  }

  private async resolveGraderModel(): Promise<string | null> {
    const source = this.config.graderModelSource || 'default';
    console.debug('[DocumentGrader] Resolving grader model with source:', source);

    switch (source) {
      case 'chat':
        // Use the model selected in the Chat View Page
        if (this.getChatModelFn) {
          const chatModel = this.getChatModelFn();
          if (chatModel?.trim()) {
            console.debug('[DocumentGrader] Using chat model from active view:', chatModel);
            return chatModel.trim();
          } else {
            console.warn('[DocumentGrader] Chat model not available from active view');
          }
        } else {
          console.warn('[DocumentGrader] No chat model function available');
        }
        
        // If chat model is not available, fall back to default model
        console.warn('[DocumentGrader] Falling back to default model for chat source');
        const currentDefaultModel = this.getDefaultModelFn ? this.getDefaultModelFn() : undefined;
        if (currentDefaultModel?.trim()) {
          console.debug('[DocumentGrader] Using default model as fallback:', currentDefaultModel);
          return currentDefaultModel.trim();
        }
        // If no default model, fall back to first available reasoning model
        return await this.getFirstAvailableReasoningModel();

      case 'default':
        // Use the Settings -> General -> Default Model only
        const defaultModel = this.getDefaultModelFn ? this.getDefaultModelFn() : undefined;
        if (defaultModel?.trim()) {
          console.debug('[DocumentGrader] Using default model from settings:', defaultModel);
          return defaultModel.trim();
        } else {
          console.warn('[DocumentGrader] No default model configured in settings');
          // If no default model is set, fall back to first available reasoning model
          return await this.getFirstAvailableReasoningModel();
        }

      case 'specific':
        // Use the manually specified model from the model list in settings
        if (this.config.graderModel?.trim()) {
          try {
            const availableModels = await ModelManager.getAllAvailableModels(this.llmConfigs);
            const configuredGraderModel = availableModels.find(m => m.id === this.config.graderModel?.trim());
            if (configuredGraderModel) {
              console.debug('[DocumentGrader] Using configured grader model:', configuredGraderModel.id);
              return configuredGraderModel.id;
            } else {
              console.warn('[DocumentGrader] Configured grader model not found:', this.config.graderModel);
              // If specific model is not found, fall back to default model
              console.warn('[DocumentGrader] Falling back to default model for specific source');
              const fallbackDefaultModel = this.getDefaultModelFn ? this.getDefaultModelFn() : undefined;
              if (fallbackDefaultModel?.trim()) {
                console.debug('[DocumentGrader] Using default model as fallback:', fallbackDefaultModel);
                return fallbackDefaultModel.trim();
              }
              // If no default model, fall back to first available reasoning model
              return await this.getFirstAvailableReasoningModel();
            }
          } catch (error) {
            console.error('[DocumentGrader] Error validating configured grader model:', error);
            // Fall back to default model
            const fallbackDefaultModel = this.getDefaultModelFn ? this.getDefaultModelFn() : undefined;
            if (fallbackDefaultModel?.trim()) {
              console.debug('[DocumentGrader] Using default model as fallback after error:', fallbackDefaultModel);
              return fallbackDefaultModel.trim();
            }
            return await this.getFirstAvailableReasoningModel();
          }
        } else {
          console.warn('[DocumentGrader] Specific model source selected but no model configured');
          // Fall back to default model
          const fallbackDefaultModel = this.getDefaultModelFn ? this.getDefaultModelFn() : undefined;
          if (fallbackDefaultModel?.trim()) {
            console.debug('[DocumentGrader] Using default model as fallback:', fallbackDefaultModel);
            return fallbackDefaultModel.trim();
          }
          return await this.getFirstAvailableReasoningModel();
        }

      default:
        console.warn('[DocumentGrader] Unknown grader model source');
        // For any unknown values, use default model
        const unknownDefaultModel = this.getDefaultModelFn ? this.getDefaultModelFn() : undefined;
        if (unknownDefaultModel?.trim()) {
          console.debug('[DocumentGrader] Using default model for unknown source:', unknownDefaultModel);
          return unknownDefaultModel.trim();
        }
        return await this.getFirstAvailableReasoningModel();
    }
  }

  // Helper method to get the first available reasoning model as a fallback
  private async getFirstAvailableReasoningModel(): Promise<string | null> {
    try {
      const allModels = await ModelManager.getAllAvailableModels(this.llmConfigs);
      
      // Look for reasoning-capable models first
      const reasoningGraderModel = allModels.find(m => m.capabilities?.includes('reasoning') && m.enabled !== false);
      if (reasoningGraderModel) {
        console.debug('[DocumentGrader] Using first available reasoning model:', reasoningGraderModel.id);
        return reasoningGraderModel.id;
      }
      
      // Fallback to chat models
      const chatModel = allModels.find(m => m.capabilities?.includes('chat') && m.enabled !== false);
      if (chatModel) {
        console.debug('[DocumentGrader] Using first available chat model:', chatModel.id);
        return chatModel.id;
      }
      
      // Last resort: use any available model
      const anyModel = allModels.find(m => m.enabled !== false);
      if (anyModel) {
        console.debug('[DocumentGrader] Using first available model:', anyModel.id);
        return anyModel.id;
      }
    } catch (error) {
      console.error('[DocumentGrader] Error getting available models:', error);
    }

    console.warn('[DocumentGrader] No models found, using fallback');
    return 'gpt-4o'; // Ultimate fallback
  }
}
