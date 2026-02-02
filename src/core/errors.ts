/**
 * Error System
 * Custom error types and error handling utilities
 */

// AppError class as specified in architecture
export class AppError extends Error {
  constructor(
    public _code: string,
    message: string,
    public _type: 'validation' | 'business' | 'infrastructure' | 'external',
    public _recoverable: boolean = true,
    public _context?: Record<string, unknown>,
    public _statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppError';
  }

  toJSON() {
    return {
      name: this.name,
      code: this._code,
      message: this.message,
      type: this._type,
      recoverable: this._recoverable,
      context: this._context,
      statusCode: this._statusCode
    };
  }
}

/**
 * LLM Provider Error
 */
export class LLMProviderError extends AppError {
  constructor(provider: string, message: string, context?: Record<string, unknown>) {
    super('LLM_PROVIDER_ERROR', `[${provider}] ${message}`, 'infrastructure', true, context, 502);
  }
}

/**
 * RAG Index Error
 */
export class RAGIndexError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('RAG_INDEX_ERROR', message, 'infrastructure', true, context);
  }
}

/**
 * Tool Execution Error
 */
export class ToolExecutionError extends AppError {
  constructor(toolName: string, message: string, context?: Record<string, unknown>) {
    super('TOOL_EXECUTION_ERROR', `Tool "${toolName}" failed: ${message}`, 'business', false, context, 400);
  }
}

/**
 * MCP Connection Error
 */
export class MCPConnectionError extends AppError {
  constructor(serverName: string, message: string, context?: Record<string, unknown>) {
    super('MCP_CONNECTION_ERROR', `MCP server "${serverName}": ${message}`, 'infrastructure', true, context, 502);
  }
}

/**
 * Configuration Error
 */
export class ConfigurationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('CONFIGURATION_ERROR', message, 'validation', false, context, 400);
  }
}

/**
 * Validation Error
 */
export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, 'validation', false, context, 400);
  }
}

/**
 * Not Found Error
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id: string, context?: Record<string, unknown>) {
    super('NOT_FOUND_ERROR', `${resource} not found: ${id}`, 'business', false, context, 404);
  }
}

export { AppError as BaseAppError };
