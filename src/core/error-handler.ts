/**
 * Error Handler
 * Centralized error handling and logging
 */

import { Notice } from 'obsidian';
import { AppError } from './errors';
import { eventBus, PluginEvent } from './event-bus';

export interface ErrorHandlerOptions {
	showNotice?: boolean;
	logToConsole?: boolean;
	emitEvent?: boolean;
	context?: string;
}

export class ErrorHandler {
	/**
	 * Handle an error
	 */
	handle(error: Error, options: ErrorHandlerOptions = {}): void {
		const {
			showNotice = true,
			logToConsole = true,
			emitEvent = true,
			context
		} = options;

		if (error instanceof AppError) {
			this.handleAppError(error, { showNotice, logToConsole, emitEvent, context });
		} else {
			this.handleUnknownError(error, { showNotice, logToConsole, emitEvent, context });
		}
	}

	/**
	 * Handle application error
	 */
	private handleAppError(
		error: AppError,
		options: ErrorHandlerOptions
	): void {
		const { showNotice, logToConsole, emitEvent, context } = options;

		const prefix = context ? `[${context}]` : '';
		const message = `${prefix} ${error.message}`;

		if (logToConsole) {
			console.error(`[${error.code}]`, message, error.context, error.stack);
		}

		if (showNotice) {
			new Notice(`Error: ${error.message}`, 5000);
		}

		if (emitEvent) {
			eventBus.emitSync(PluginEvent.ERROR_OCCURRED, {
				error: error.toJSON(),
				context
			});
		}
	}

	/**
	 * Handle unknown error
	 */
	private handleUnknownError(
		error: Error,
		options: ErrorHandlerOptions
	): void {
		const { showNotice, logToConsole, emitEvent, context } = options;

		const prefix = context ? `[${context}]` : '';
		const message = `${prefix} ${error.message}`;

		if (logToConsole) {
			console.error('[UNKNOWN_ERROR]', message, error.stack);
		}

		if (showNotice) {
			new Notice(`Unexpected error: ${error.message}`, 5000);
		}

		if (emitEvent) {
			eventBus.emitSync(PluginEvent.ERROR_OCCURRED, {
				error: {
					name: error.name,
					message: error.message,
					stack: error.stack
				},
				context
			});
		}
	}

	/**
	 * Handle async errors
	 */
	async handleAsync<T>(
		fn: () => Promise<T>,
		options: ErrorHandlerOptions = {}
	): Promise<T | null> {
		try {
			return await fn();
		} catch (error) {
			this.handle(error as Error, options);
			return null;
		}
	}

	/**
	 * Handle sync errors
	 */
	handleSync<T>(
		fn: () => T,
		options: ErrorHandlerOptions = {}
	): T | null {
		try {
			return fn();
		} catch (error) {
			this.handle(error as Error, options);
			return null;
		}
	}
}

// Global error handler instance
export const errorHandler = new ErrorHandler();

/**
 * Decorator for error handling
 */
export function HandleErrors(context?: string, options?: ErrorHandlerOptions) {
	return function (
		target: any,
		propertyKey: string,
		descriptor: PropertyDescriptor
	) {
		const originalMethod = descriptor.value;

		descriptor.value = async function (...args: any[]) {
			try {
				return await originalMethod.apply(this, args);
			} catch (error) {
				errorHandler.handle(error as Error, {
					...options,
					context: context || `${target.constructor.name}.${propertyKey}`
				});
				throw error;
			}
		};

		return descriptor;
	};
}
