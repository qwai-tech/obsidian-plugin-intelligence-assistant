/**
 * Logging utility for consistent, context-aware logging throughout the application
 */

export enum LogLevel {
	_DEBUG = 0,
	_INFO = 1,
	_WARN = 2,
	_ERROR = 3,
}

export class Logger {
	private static globalLevel: LogLevel = LogLevel._INFO;

	constructor(
		private _context: string,
		private _minLevel: LogLevel = Logger.globalLevel
	) {}

	/**
	 * Set the global minimum log level for all loggers
	 */
	static setGlobalLevel(level: LogLevel): void {
		Logger.globalLevel = level;
	}

	/**
	 * Log debug message (development/troubleshooting)
	 */
	debug(message: string, ...args: unknown[]): void {
		if (this._minLevel <= LogLevel._DEBUG) {
			console.debug(`[${this._context}] ${message}`, ...args);
		}
	}

	/**
	 * Log info message (normal operations)
	 */
	info(message: string, ...args: unknown[]): void {
		if (this._minLevel <= LogLevel._INFO) {
			console.debug(`[${this._context}] ${message}`, ...args);
		}
	}

	/**
	 * Log warning message (potential issues)
	 */
	warn(message: string, ...args: unknown[]): void {
		if (this._minLevel <= LogLevel._WARN) {
			console.warn(`[${this._context}] ${message}`, ...args);
		}
	}

	/**
	 * Log error message (failures)
	 */
	error(message: string, err?: Error, ...args: unknown[]): void {
		if (this._minLevel <= LogLevel._ERROR) {
			if (err instanceof Error) {
				console.error(`[${this._context}] ${message}`, err.message, err.stack, ...args);
			} else {
				console.error(`[${this._context}] ${message}`, err, ...args);
			}
		}
	}

	/**
	 * Create a child logger with a sub-context
	 */
	child(subContext: string): Logger {
		return new Logger(`${this._context}:${subContext}`, this._minLevel);
	}

	/**
	 * Time an operation and log the duration
	 */
	async time<T>(label: string, operation: () => Promise<T>): Promise<T> {
		const start = Date.now();
		try {
			this.debug(`Starting ${label}...`);
			const result = await operation();
			const duration = Date.now() - start;
			this.debug(`Completed ${label} in ${duration}ms`);
			return result;
		} catch (error) {
			const duration = Date.now() - start;
			this.error(`Failed ${label} after ${duration}ms`, error instanceof Error ? error : undefined);
			throw error;
		}
	}
}

// Create pre-configured loggers for common contexts
export const createLogger = (context: string, level?: LogLevel): Logger => {
	return new Logger(context, level);
};

// Export commonly used loggers
export const PluginLogger = new Logger('Plugin');
export const MCPLogger = new Logger('MCP');
export const RAGLogger = new Logger('RAG');
export const WorkflowLogger = new Logger('Workflow');
export const LLMLogger = new Logger('LLM');
