/**
 * Test suite for Error Handler
 */

import { ErrorHandler } from '../../core/error-handler';
import { LLMProviderError, ValidationError, ConfigurationError } from '../../core/errors';
import { EventBus } from '../../core/event-bus';

describe('ErrorHandler', () => {
	let errorHandler: ErrorHandler;
	let eventBus: EventBus;

	beforeEach(() => {
		errorHandler = new ErrorHandler();
		eventBus = new EventBus();
	});

	afterEach(() => {
		eventBus.removeAllListeners();
	});

	describe('handle', () => {
		it('should handle AppError', () => {
			const error = new LLMProviderError('openai', 'API key invalid');
			const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

			errorHandler.handle(error, { showNotice: false });

			expect(consoleSpy).toHaveBeenCalledWith(
				'[LLM_PROVIDER_ERROR]',
				expect.stringContaining('[openai] API key invalid'),
				undefined,
				expect.any(String)
			);

			consoleSpy.mockRestore();
		});

		it('should handle unknown errors', () => {
			const error = new Error('Unknown error');
			const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

			errorHandler.handle(error, { showNotice: false });

			expect(consoleSpy).toHaveBeenCalledWith(
				'[UNKNOWN_ERROR]',
				expect.stringContaining('Unknown error'),
				expect.any(String)
			);

			consoleSpy.mockRestore();
		});

		it('should include context in error message', () => {
			const error = new Error('Test error');
			const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

			errorHandler.handle(error, {
				context: 'TestService.testMethod',
				showNotice: false
			});

			expect(consoleSpy).toHaveBeenCalledWith(
				'[UNKNOWN_ERROR]',
				expect.stringContaining('[TestService.testMethod]'),
				expect.any(String)
			);

			consoleSpy.mockRestore();
		});

		it('should respect logToConsole option', () => {
			const error = new Error('Test error');
			const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

			errorHandler.handle(error, {
				logToConsole: false,
				showNotice: false
			});

			expect(consoleSpy).not.toHaveBeenCalled();

			consoleSpy.mockRestore();
		});
	});

	describe('handleAsync', () => {
		it('should execute async function successfully', async () => {
			const result = await errorHandler.handleAsync(
				async () => 'success',
				{ showNotice: false, emitEvent: false }
			);

			expect(result).toBe('success');
		});

		it('should catch and handle async errors', async () => {
			const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

			const result = await errorHandler.handleAsync(
				async () => {
					throw new Error('Async error');
				},
				{ showNotice: false, emitEvent: false }
			);

			expect(result).toBeNull();
			expect(consoleSpy).toHaveBeenCalled();

			consoleSpy.mockRestore();
		});
	});

	describe('handleSync', () => {
		it('should execute sync function successfully', () => {
			const result = errorHandler.handleSync(
				() => 'success',
				{ showNotice: false, emitEvent: false }
			);

			expect(result).toBe('success');
		});

		it('should catch and handle sync errors', () => {
			const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

			const result = errorHandler.handleSync(
				() => {
					throw new Error('Sync error');
				},
				{ showNotice: false, emitEvent: false }
			);

			expect(result).toBeNull();
			expect(consoleSpy).toHaveBeenCalled();

			consoleSpy.mockRestore();
		});
	});
});

describe('AppError', () => {
	describe('LLMProviderError', () => {
		it('should create error with provider info', () => {
			const error = new LLMProviderError('openai', 'Rate limit exceeded');

			expect(error.name).toBe('LLMProviderError');
			expect(error.message).toBe('[openai] Rate limit exceeded');
			expect(error.code).toBe('LLM_PROVIDER_ERROR');
			expect(error.statusCode).toBe(502);
		});

		it('should serialize to JSON', () => {
			const error = new LLMProviderError('openai', 'API error', { retry: true });
			const json = error.toJSON();

			expect(json.name).toBe('LLMProviderError');
			expect(json.code).toBe('LLM_PROVIDER_ERROR');
			expect(json.context).toEqual({ retry: true });
		});
	});

	describe('ValidationError', () => {
		it('should create validation error', () => {
			const error = new ValidationError('Invalid input', { field: 'email' });

			expect(error.name).toBe('ValidationError');
			expect(error.code).toBe('VALIDATION_ERROR');
			expect(error.statusCode).toBe(400);
			expect(error.context).toEqual({ field: 'email' });
		});
	});

	describe('ConfigurationError', () => {
		it('should create configuration error', () => {
			const error = new ConfigurationError('Missing API key');

			expect(error.name).toBe('ConfigurationError');
			expect(error.code).toBe('CONFIGURATION_ERROR');
			expect(error.statusCode).toBe(400);
		});
	});
});
