/**
 * Error handling utilities for consistent error management and user feedback
 */

import { Notice } from 'obsidian';
import { Logger, createLogger } from './logger';

const errorLogger = createLogger('ErrorHandler');

/**
 * Custom error class for plugin-specific errors
 */
export class PluginError extends Error {
	constructor(
		message: string,
		public readonly _context?: Record<string, unknown>,
		public readonly _userMessage?: string,
		public readonly _originalError?: Error
	) {
		super(message);
		this.name = 'PluginError';

		// Maintains proper stack trace for where our error was thrown (only available on V8)
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, PluginError);
		}
	}
}

/**
 * Error handler options
 */
export interface ErrorHandlerOptions {
	/** Whether to show a Notice to the user */
	showNotice?: boolean;
	/** Custom user-friendly message */
	userMessage?: string;
	/** Whether to log the error */
	logError?: boolean;
	/** Custom logger to use */
	logger?: Logger;
	/** Fallback value to return on error */
	fallback?: unknown;
	/** Whether to rethrow the error after handling */
	rethrow?: boolean;
}

/**
 * Handles async operations with consistent error handling
 * @param operation - The async operation to execute
 * @param context - Description of what's being done
 * @param options - Error handling options
 * @returns The operation result or fallback value
 */
export async function handleAsyncError<T>(
	operation: () => Promise<T>,
	context: string,
	options: ErrorHandlerOptions = {}
): Promise<T | undefined> {
	const {
		showNotice = true,
		userMessage,
		logError = true,
		logger = errorLogger,
		fallback,
		rethrow = false,
	} = options;

	try {
		return await operation();
	} catch (error: unknown) {
		// Log the error
		if (logError) {
			const message = `Error in ${context}`;
			logger.error(message, error instanceof Error ? error : undefined);
		}

		// Show user notification
		if (showNotice) {
			const noticeMessage = userMessage || `Failed to ${context}`;
			new Notice(noticeMessage);
		}

		// Rethrow if requested
		if (rethrow) {
			throw error;
		}

		// Return fallback if provided
		if (fallback !== undefined) {
			return fallback;
		}

		return undefined;
	}
}

/**
 * Handles sync operations with consistent error handling
 */
export function handleSyncError<T>(
	operation: () => T,
	context: string,
	options: ErrorHandlerOptions = {}
): T | undefined {
	const {
		showNotice = true,
		userMessage,
		logError = true,
		logger = errorLogger,
		fallback,
		rethrow = false,
	} = options;

	try {
		return operation();
	} catch (error: unknown) {
		// Log the error
		if (logError) {
			const message = `Error in ${context}`;
			logger.error(message, error instanceof Error ? error : undefined);
		}

		// Show user notification
		if (showNotice) {
			const noticeMessage = userMessage || `Failed to ${context}`;
			new Notice(noticeMessage);
		}

		// Rethrow if requested
		if (rethrow) {
			throw error;
		}

		// Return fallback if provided
		if (fallback !== undefined) {
			return fallback;
		}

		return undefined;
	}
}

/**
 * Wraps an async function with error handling
 */
export function withErrorHandler<TArgs extends unknown[], TReturn>(
	fn: (..._args: TArgs) => Promise<TReturn>,
	context: string,
	options: ErrorHandlerOptions = {}
): (..._args: TArgs) => Promise<TReturn | undefined> {
	return async (..._args: TArgs) => {
		return handleAsyncError(() => fn(..._args), context, options);
	};
}

/**
 * Extracts error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === 'string') {
		return error;
	}
	if (error && typeof error === 'object' && 'message' in error) {
		return String((error as { message: unknown }).message);
	}
	return 'Unknown error';
}

/**
 * Checks if error is a specific type
 */
export function isErrorType(error: unknown, errorType: new (..._args: unknown[]) => Error): boolean {
	return error instanceof errorType;
}

/**
 * Creates a user-friendly error message
 */
export function createUserMessage(error: unknown, defaultMessage: string): string {
	const errorMessage = getErrorMessage(error);

	// Check for common error patterns and make them user-friendly
	if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
		return 'Network error. Please check your internet connection.';
	}
	if (errorMessage.includes('timeout')) {
		return 'Request timed out. Please try again.';
	}
	if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
		return 'Authentication failed. Please check your API key.';
	}
	if (errorMessage.includes('403') || errorMessage.includes('forbidden')) {
		return 'Access denied. Please check your permissions.';
	}
	if (errorMessage.includes('404') || errorMessage.includes('not found')) {
		return 'Resource not found.';
	}
	if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
		return 'Rate limit exceeded. Please try again later.';
	}
	if (errorMessage.includes('500') || errorMessage.includes('internal server')) {
		return 'Server error. Please try again later.';
	}

	return defaultMessage;
}
