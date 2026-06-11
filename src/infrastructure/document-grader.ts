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
    metadata?: Record<string, unknown>;
  };
  chunkId: string;
}

export class DocumentGrader {
  private config: RAGConfig;
  private llmConfigs: LLMConfig[];

  constructor(config: RAGConfig, llmConfigs: LLMConfig[]) {
    this.config = config;
    this.llmConfigs = llmConfigs;
  }

  async gradeDocument(request: GradeRequest, chatModel?: string, defaultModel?: string): Promise<DocumentGrade> {
    if (!this.config.enableGradingThreshold) {
      return this.getDefaultGrade(request);
    }

    const graderModel = await this.resolveGraderModel(chatModel, defaultModel);
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
        maxTokens: 2000,
        responseFormat: { type: 'json_object' }
      });

      if (!response.content?.trim()) {
        console.warn('[DocumentGrader] Grader model returned empty response; using neutral fallback grade');
        return {
          relevance: 5,
          accuracy: 5,
          supportQuality: 5,
          shouldUse: true,
          explanation: 'Grader model returned empty response; using neutral fallback grade',
          chunkId: request.chunkId,
          documentPath: request.document.path
        };
      }

      const gradeResult = this.parseResponse(response.content);
      const grade = this.createGrade(gradeResult, request);

      // Apply thresholds
      if (this.config.enableGradingThreshold) {
        grade.shouldUse = this.meetsThresholds(grade);
      }

      return grade;
    } catch (error) {
      console.error('[DocumentGrader] Error grading document:', error);
      const err = error instanceof Error ? error : new Error(String(error));
      return {
        relevance: 5,
        accuracy: 5,
        supportQuality: 5,
        shouldUse: true,
        explanation: `Error during grading: ${err.message}`,
        chunkId: request.chunkId,
        documentPath: request.document.path
      };
    }
  }

  async gradeDocuments(requests: GradeRequest[], chatModel?: string, defaultModel?: string): Promise<DocumentGrade[]> {
    if (!this.config.enableGradingThreshold) {
      return requests.map(req => this.getDefaultGrade(req));
    }

    const parallelLimit = Math.min(this.config.graderParallelProcessing || 3, 10);
    const grades: DocumentGrade[] = [];

    for (let i = 0; i < requests.length; i += parallelLimit) {
      const batch = requests.slice(i, i + parallelLimit);
      const batchGrades = await Promise.all(
        batch.map(request => this.gradeDocument(request, chatModel, defaultModel))
      );
      grades.push(...batchGrades);

      if (i + parallelLimit < requests.length) {
        await new Promise(resolve => window.setTimeout(resolve, 100));
      }
    }

    return grades;
  }

  filterDocumentsByGrade(documents: Array<{ id: string; [key: string]: unknown }>, grades: DocumentGrade[]): Array<{ id: string; [key: string]: unknown }> {
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

  private parseResponse(content: string): unknown {
    try {
      // Look for JSON block wrapped in triple backticks first
      const mdJsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (mdJsonMatch) {
        return JSON.parse(mdJsonMatch[1]);
      }

      // Fallback: search for first { and last }
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      return JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch (error) {
      console.error('[DocumentGrader] Failed to parse JSON response:', error, 'Content:', content);
      throw new Error('Invalid JSON response from model');
    }
  }

  private createGrade(gradeResult: unknown, request: GradeRequest): DocumentGrade {
    const result = gradeResult as Record<string, unknown>;
    return {
      relevance: this.normalizeScore(result.relevance),
      accuracy: this.normalizeScore(result.accuracy),
      supportQuality: this.normalizeScore(result.supportQuality),
      shouldUse: typeof result.shouldUse === 'boolean' ? result.shouldUse : true,
      explanation: typeof result.explanation === 'string' ? result.explanation : 'No explanation provided',
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

  private normalizeScore(score: unknown): number {
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

  private async resolveGraderModel(chatModel?: string, defaultModel?: string): Promise<string | null> {
    const source = this.config.graderModelSource || 'default';
    console.debug('[DocumentGrader] Resolving grader model with source:', source);

    switch (source) {
      case 'chat': {
        if (chatModel?.trim()) {
          console.debug('[DocumentGrader] Using chat model:', chatModel);
          return chatModel.trim();
        }
        console.warn('[DocumentGrader] Chat model not available, falling back to default');
        if (defaultModel?.trim()) {
          return defaultModel.trim();
        }
        return await this.getFirstAvailableGraderModel();
      }

      case 'default': {
        if (defaultModel?.trim()) {
          console.debug('[DocumentGrader] Using default model from settings:', defaultModel);
          return defaultModel.trim();
        }
        console.warn('[DocumentGrader] No default model configured in settings');
        return await this.getFirstAvailableGraderModel();
      }

      case 'specific':
      case 'custom': {
        if (this.config.graderModel?.trim()) {
          try {
            const availableModels = await ModelManager.getAllAvailableModels(this.llmConfigs);
            const configuredGraderModel = availableModels.find(m => m.id === this.config.graderModel?.trim());
            if (configuredGraderModel) {
              console.debug('[DocumentGrader] Using configured grader model:', configuredGraderModel.id);
              return configuredGraderModel.id;
            }
            console.warn('[DocumentGrader] Configured grader model not found:', this.config.graderModel);
            if (defaultModel?.trim()) return defaultModel.trim();
            return await this.getFirstAvailableGraderModel();
          } catch (error) {
            console.error('[DocumentGrader] Error validating configured grader model:', error);
            if (defaultModel?.trim()) return defaultModel.trim();
            return await this.getFirstAvailableGraderModel();
          }
        } else {
          console.warn('[DocumentGrader] Specific model source selected but no model configured');
          if (defaultModel?.trim()) {
            console.debug('[DocumentGrader] Using default model as fallback:', defaultModel);
            return defaultModel.trim();
          }
          return await this.getFirstAvailableGraderModel();
        }
      }

      default: {
        console.warn('[DocumentGrader] Unknown grader model source');
        if (defaultModel?.trim()) {
          console.debug('[DocumentGrader] Using default model for unknown source:', defaultModel);
          return defaultModel.trim();
        }
        return await this.getFirstAvailableGraderModel();
      }
    }
  }

  // Helper method to get the first available model suitable for short JSON grading.
  private async getFirstAvailableGraderModel(): Promise<string | null> {
    try {
      const allModels = await ModelManager.getAllAvailableModels(this.llmConfigs);

      // Prefer non-reasoning JSON chat models. Reasoning models can spend small
      // completion budgets internally and return empty content for this task.
      const jsonChatModel = allModels.find(m =>
        m.enabled !== false &&
        m.capabilities?.includes('chat') &&
        m.capabilities?.includes('json_mode') &&
        !m.capabilities?.includes('reasoning')
      );
      if (jsonChatModel) {
        console.debug('[DocumentGrader] Using first available JSON chat model:', jsonChatModel.id);
        return jsonChatModel.id;
      }
      
      // Fallback to any non-reasoning chat model.
      const chatModel = allModels.find(m =>
        m.enabled !== false &&
        m.capabilities?.includes('chat') &&
        !m.capabilities?.includes('reasoning')
      );
      if (chatModel) {
        console.debug('[DocumentGrader] Using first available chat model:', chatModel.id);
        return chatModel.id;
      }

      // Reasoning models are a last resort for grading.
      const reasoningGraderModel = allModels.find(m => m.capabilities?.includes('reasoning') && m.enabled !== false);
      if (reasoningGraderModel) {
        console.debug('[DocumentGrader] Using first available reasoning model:', reasoningGraderModel.id);
        return reasoningGraderModel.id;
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
