/**
 * Workflow System V2 - Enhanced Error Handling
 *
 * Comprehensive error classification, handling, and reporting system
 * for workflow execution and system operations.
 */

import { ExecutionLogEntry } from '../core/types';

// ============================================================================
// ERROR CLASSES
// ============================================================================

export const WorkflowErrorType = {
  // Configuration errors
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NODE_NOT_FOUND: 'NODE_NOT_FOUND',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  
  // Execution errors
  EXECUTION_ERROR: 'EXECUTION_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  MEMORY_ERROR: 'MEMORY_ERROR',
  RESOURCE_ERROR: 'RESOURCE_ERROR',
  
  // Service errors
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  SERVICE_ERROR: 'SERVICE_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  
  // Security errors
  SECURITY_VIOLATION: 'SECURITY_VIOLATION',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  SANDBOX_VIOLATION: 'SANDBOX_VIOLATION',
  
  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  HTTP_ERROR: 'HTTP_ERROR',
  
  // System errors
  SYSTEM_ERROR: 'SYSTEM_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type WorkflowErrorTypeValue = typeof WorkflowErrorType[keyof typeof WorkflowErrorType];

export interface WorkflowErrorDetails {
	/** Error type classification */
	type: WorkflowErrorTypeValue;
  /** Error message */
  message: string;
  /** Stack trace if available */
  stack?: string;
  /** Error code (if applicable) */
  code?: string | number;
  /** Additional context data */
  context?: Record<string, unknown>;
  /** Related node information */
  node?: {
    id: string;
    type: string;
    name: string;
  };
  /** Timestamp when error occurred */
  timestamp: number;
  /** Whether error is recoverable */
  recoverable?: boolean;
}

/**
 * Base workflow error class
 */
export class WorkflowError extends Error {
	public readonly type: WorkflowErrorTypeValue;
  public readonly context?: Record<string, unknown>;
  public node?: { id: string; type: string; name: string };
  public readonly recoverable: boolean;
  public readonly code?: string | number;
  public readonly timestamp: number;

  constructor(details: WorkflowErrorDetails) {
    super(details.message);
    this.name = 'WorkflowError';
    this.type = details.type;
    this.context = details.context;
    this.node = details.node;
    this.recoverable = details.recoverable ?? false;
    this.code = details.code;
    this.timestamp = details.timestamp || Date.now();
    
    if (details.stack) {
      this.stack = details.stack;
    }
  }

  /**
   * Convert error to log entry
   */
  toLogEntry(): ExecutionLogEntry {
    return {
      nodeId: this.node?.id ?? 'unknown',
      nodeName: this.node?.name ?? 'Unknown Node',
      timestamp: this.timestamp,
      status: 'error',
      error: this.message,
      duration: 0, // Will be filled by caller
    };
  }

  /**
   * Convert error to JSON-serializable object
   */
  toJSON(): unknown {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      stack: this.stack,
      code: this.code,
      context: this.context,
      node: this.node,
      recoverable: this.recoverable,
      timestamp: this.timestamp,
    };
  }

  /**
   * Create error from JSON
   */
	static fromJSON(obj: Record<string, unknown>): WorkflowError {
		return new WorkflowError({
			type: obj.type as WorkflowErrorTypeValue,
      message: obj.message as string,
      stack: obj.stack as string | undefined,
      code: obj.code as string | number | undefined,
      context: obj.context as Record<string, unknown> | undefined,
      node: obj.node as { id: string; type: string; name: string } | undefined,
      recoverable: obj.recoverable as boolean | undefined,
      timestamp: obj.timestamp as number,
    });
  }
}

// ============================================================================
// SPECIFIC ERROR CLASSES
// ============================================================================

/**
 * Configuration-related errors
 */
export class ConfigurationError extends WorkflowError {
  constructor(message: string, context?: Record<string, unknown>, node?: { id: string; type: string; name: string }) {
    super({
      type: WorkflowErrorType.CONFIGURATION_ERROR,
      message,
      context,
      node,
      recoverable: true,
      timestamp: Date.now(),
    });
  }
}

/**
 * Validation-related errors
 */
export class ValidationError extends WorkflowError {
  constructor(message: string, context?: Record<string, unknown>, node?: { id: string; type: string; name: string }) {
    super({
      type: WorkflowErrorType.VALIDATION_ERROR,
      message,
      context,
      node,
      recoverable: true,
      timestamp: Date.now(),
    });
  }
}

/**
 * Execution-related errors
 */
export class ExecutionError extends WorkflowError {
  constructor(message: string, context?: Record<string, unknown>, node?: { id: string; type: string; name: string }) {
    super({
      type: WorkflowErrorType.EXECUTION_ERROR,
      message,
      context,
      node,
      recoverable: true,
      timestamp: Date.now(),
    });
  }
}

/**
 * Timeout-related errors
 */
export class TimeoutError extends WorkflowError {
  constructor(message: string, timeout: number, context?: Record<string, unknown>, node?: { id: string; type: string; name: string }) {
    super({
      type: WorkflowErrorType.TIMEOUT_ERROR,
      message,
      context: { ...context, timeout },
      node,
      recoverable: true,
      timestamp: Date.now(),
    });
  }
}

/**
 * Security-related errors
 */
export class SecurityError extends WorkflowError {
  constructor(message: string, context?: Record<string, unknown>, node?: { id: string; type: string; name: string }) {
    super({
      type: WorkflowErrorType.SECURITY_VIOLATION,
      message,
      context,
      node,
      recoverable: false, // Security violations should not be recovered
      timestamp: Date.now(),
    });
  }
}

/**
 * Service-related errors
 */
export class ServiceError extends WorkflowError {
  constructor(message: string, context?: Record<string, unknown>, node?: { id: string; type: string; name: string }) {
    super({
      type: WorkflowErrorType.SERVICE_ERROR,
      message,
      context,
      node,
      recoverable: true,
      timestamp: Date.now(),
    });
  }
}

// ============================================================================
// ERROR HANDLING UTILITIES
// ============================================================================

/**
 * Error handler utilities
 */
export class ErrorHandler {
  /**
   * Wrap an async operation with error handling
   */
  static async wrapAsync<T>(
    operation: () => Promise<T>,
    onError?: (_error: Error) => void
  ): Promise<T | null> {
    try {
      return await operation();
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (onError) {
        onError(err);
      } else {
        console.error('Unhandled error:', error);
      }
      return null;
    }
  }

  /**
   * Create a workflow error from a generic error
   */
	static fromError(error: Error, type: WorkflowErrorTypeValue = WorkflowErrorType.INTERNAL_ERROR): WorkflowError {
    if (error instanceof WorkflowError) {
      return error;
    }

    return new WorkflowError({
      type,
      message: error.message,
      stack: error.stack,
      timestamp: Date.now(),
    });
  }

  /**
   * Create a contextual error with node information
   */
  static createContextualError(
    error: Error,
    nodeId: string,
    nodeType: string,
    nodeName: string,
    type: WorkflowErrorTypeValue = WorkflowErrorType.EXECUTION_ERROR
  ): WorkflowError {
    const workflowError = this.fromError(error, type);
    
    // Add node context if not already present
    if (!workflowError.node) {
      workflowError.node = {
        id: nodeId,
        type: nodeType,
        name: nodeName,
      };
    }
    
    return workflowError;
  }

  /**
   * Format error for user display
   */
  static formatForUser(error: WorkflowError): string {
    let message = `[${error.type}] ${error.message}`;
    
    if (error.node) {
      message += ` (Node: ${error.node.name} [${error.node.type}])`;
    }
    
    if (error.code) {
      message += ` [Code: ${error.code}]`;
    }
    
    return message;
  }

  /**
   * Log error with appropriate level
   */
  static logError(error: WorkflowError, logger?: (_message: string, _level: 'error' | 'warn' | 'info') => void): void {
    const log = logger || ((_message: string, _level: 'error' | 'warn' | 'info') => console.error(_message));
    const formattedMessage = this.formatForUser(error);

    // Map error types to log levels
    const logLevel: 'error' | 'warn' | 'info' =
      error.type === WorkflowErrorType.SECURITY_VIOLATION ? 'error' :
      error.type === WorkflowErrorType.SYSTEM_ERROR ? 'error' :
      error.type === WorkflowErrorType.INTERNAL_ERROR ? 'error' :
      error.type === WorkflowErrorType.VALIDATION_ERROR ? 'warn' :
      error.type === WorkflowErrorType.TIMEOUT_ERROR ? 'warn' :
      'error';

    log(`[Workflow Error] ${formattedMessage}`, logLevel);

    // Log stack trace for severe errors
    if (logLevel === 'error' && error.stack) {
      log(`Stack trace:\n${error.stack}`, 'error');
    }
  }

  /**
   * Check if error is recoverable
   */
  static isRecoverable(error: Error): boolean {
    if (error instanceof WorkflowError) {
      return error.recoverable;
    }
    
    // Assume generic errors are not recoverable
    return false;
  }

  /**
   * Retry an operation with exponential backoff
   */
  static async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000,
    maxDelay: number = 30000
  ): Promise<T> {
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry on security or configuration errors
        if (error instanceof SecurityError || error instanceof ConfigurationError) {
          throw error;
        }
        
        // If this was the last attempt, throw the error
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Calculate delay with exponential backoff and jitter
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        const jitter = Math.random() * delay * 0.1; // 10% jitter
        const totalDelay = delay + jitter;
        
        console.warn(`Operation failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(totalDelay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, totalDelay));
      }
    }
    
    // This should never be reached due to the throw above, but TypeScript needs it
    throw lastError || new Error('Retry failed with unknown error');
  }
}
