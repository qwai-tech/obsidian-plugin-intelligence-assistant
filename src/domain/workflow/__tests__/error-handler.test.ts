/**
 * Test suite for Error Handling System
 */

import { 
  WorkflowError, 
  ConfigurationError, 
  ValidationError, 
  ExecutionError, 
  TimeoutError, 
  SecurityError, 
  ServiceError,
  ErrorHandler,
  WorkflowErrorType 
} from '../services/error-handler';

describe('ErrorHandler', () => {
  describe('WorkflowError', () => {
    it('should create a basic workflow error', () => {
      const error = new WorkflowError({
        type: WorkflowErrorType.EXECUTION_ERROR,
        message: 'Test error message',
        timestamp: Date.now(),
      });

      expect(error.type).toBe(WorkflowErrorType.EXECUTION_ERROR);
      expect(error.message).toBe('Test error message');
      expect(error.name).toBe('WorkflowError');
    });

    it('should include node context when provided', () => {
      const error = new WorkflowError({
        type: WorkflowErrorType.EXECUTION_ERROR,
        message: 'Node execution failed',
        node: {
          id: 'test-node-123',
          type: 'llm',
          name: 'AI Chat',
        },
        timestamp: Date.now(),
      });

      expect(error.node).toEqual({
        id: 'test-node-123',
        type: 'llm',
        name: 'AI Chat',
      });
    });
  });

  describe('Specific Error Types', () => {
    it('should create ConfigurationError', () => {
      const error = new ConfigurationError('Missing required parameter');
      expect(error.type).toBe(WorkflowErrorType.CONFIGURATION_ERROR);
      expect(error.recoverable).toBe(true);
    });

    it('should create ValidationError', () => {
      const error = new ValidationError('Invalid parameter value');
      expect(error.type).toBe(WorkflowErrorType.VALIDATION_ERROR);
      expect(error.recoverable).toBe(true);
    });

    it('should create ExecutionError', () => {
      const error = new ExecutionError('Node execution failed');
      expect(error.type).toBe(WorkflowErrorType.EXECUTION_ERROR);
      expect(error.recoverable).toBe(true);
    });

    it('should create TimeoutError', () => {
      const error = new TimeoutError('Operation timed out', 5000);
      expect(error.type).toBe(WorkflowErrorType.TIMEOUT_ERROR);
      expect(error.recoverable).toBe(true);
    });

    it('should create SecurityError', () => {
      const error = new SecurityError('Security violation detected');
      expect(error.type).toBe(WorkflowErrorType.SECURITY_VIOLATION);
      expect(error.recoverable).toBe(false); // Security errors should not be recoverable
    });

    it('should create ServiceError', () => {
      const error = new ServiceError('External service unavailable');
      expect(error.type).toBe(WorkflowErrorType.SERVICE_ERROR);
      expect(error.recoverable).toBe(true);
    });
  });

  describe('ErrorHandler Utilities', () => {
    it('should wrap async operations with error handling', async () => {
      const result = await ErrorHandler.wrapAsync(async () => {
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('should handle rejected promises gracefully', async () => {
      const result = await ErrorHandler.wrapAsync(async () => {
        throw new Error('Test error');
      });

      expect(result).toBeNull();
    });

    it('should convert generic errors to workflow errors', () => {
      const genericError = new Error('Generic error');
      const workflowError = ErrorHandler.fromError(genericError);

      expect(workflowError).toBeInstanceOf(WorkflowError);
      expect(workflowError.type).toBe(WorkflowErrorType.INTERNAL_ERROR);
      expect(workflowError.message).toBe('Generic error');
    });

    it('should preserve workflow errors when converting', () => {
      const originalError = new ExecutionError('Original execution error');
      const convertedError = ErrorHandler.fromError(originalError);

      expect(convertedError).toBe(originalError);
    });

    it('should determine if errors are recoverable', () => {
      const recoverableError = new ExecutionError('Recoverable error');
      const nonRecoverableError = new SecurityError('Non-recoverable error');
      const genericError = new Error('Generic error');

      expect(ErrorHandler.isRecoverable(recoverableError)).toBe(true);
      expect(ErrorHandler.isRecoverable(nonRecoverableError)).toBe(false);
      expect(ErrorHandler.isRecoverable(genericError)).toBe(false);
    });

    it('should retry operations with exponential backoff', async () => {
      let attemptCount = 0;
      
      const operation = async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      };

      const result = await ErrorHandler.retryWithBackoff(operation, 3, 10);
      expect(result).toBe('success');
      expect(attemptCount).toBe(3);
    });

    it('should not retry on security errors', async () => {
      let attemptCount = 0;
      
      const operation = async () => {
        attemptCount++;
        throw new SecurityError('Security violation');
      };

      await expect(ErrorHandler.retryWithBackoff(operation, 3, 10))
        .rejects.toThrow(SecurityError);
      
      expect(attemptCount).toBe(1); // Should only attempt once
    });
  });
});