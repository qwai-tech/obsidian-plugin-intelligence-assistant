/**
 * Error System
 * Custom error types and error handling utilities
 */

// AppError class as specified in architecture
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public type: 'validation' | 'business' | 'infrastructure' | 'external',
    public recoverable: boolean = true,
    public context?: Record<string, any>,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppError';
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      type: this.type,
      recoverable: this.recoverable,
      context: this.context,
      statusCode: this.statusCode
    };
  }
}

/**
 * LLM Provider Error
 */
export class LLMProviderError extends AppError {
  constructor(provider: string, message: string, context?: Record<string, any>) {
    super('LLM_PROVIDER_ERROR', `[${provider}] ${message}`, 'infrastructure', true, context, 502);
  }
}

/**
 * RAG Index Error
 */
export class RAGIndexError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super('RAG_INDEX_ERROR', message, 'infrastructure', true, context);
  }
}

/**
 * Tool Execution Error
 */
export class ToolExecutionError extends AppError {
  constructor(toolName: string, message: string, context?: Record<string, any>) {
    super('TOOL_EXECUTION_ERROR', `Tool "${toolName}" failed: ${message}`, 'business', false, context, 400);
  }
}

/**
 * MCP Connection Error
 */
export class MCPConnectionError extends AppError {
  constructor(serverName: string, message: string, context?: Record<string, any>) {
    super('MCP_CONNECTION_ERROR', `MCP server "${serverName}": ${message}`, 'infrastructure', true, context, 502);
  }
}

/**
 * Workflow Execution Error
 */
export class WorkflowExecutionError extends AppError {
  constructor(workflowId: string, message: string, context?: Record<string, any>) {
    super('WORKFLOW_EXECUTION_ERROR', `Workflow "${workflowId}": ${message}`, 'business', false, context, 400);
  }
}

/**
 * Configuration Error
 */
export class ConfigurationError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super('CONFIGURATION_ERROR', message, 'validation', false, context, 400);
  }
}

/**
 * Validation Error
 */
export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super('VALIDATION_ERROR', message, 'validation', false, context, 400);
  }
}

/**
 * Not Found Error
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id: string, context?: Record<string, any>) {
    super('NOT_FOUND_ERROR', `${resource} not found: ${id}`, 'business', false, context, 404);
  }
}

export { AppError as BaseAppError };
