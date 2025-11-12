/**
 * Logging utility for consistent, context-aware logging throughout the application
 */

export enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3,
}

export class Logger {
	private static globalLevel: LogLevel = LogLevel.INFO;

	constructor(
		private context: string,
		private minLevel: LogLevel = Logger.globalLevel
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
	debug(message: string, ...args: any[]): void {
		if (this.minLevel <= LogLevel.DEBUG) {
			console.debug(`[${this.context}] ${message}`, ...args);
		}
	}

	/**
	 * Log info message (normal operations)
	 */
	info(message: string, ...args: any[]): void {
		if (this.minLevel <= LogLevel.INFO) {
			console.log(`[${this.context}] ${message}`, ...args);
		}
	}

	/**
	 * Log warning message (potential issues)
	 */
	warn(message: string, ...args: any[]): void {
		if (this.minLevel <= LogLevel.WARN) {
			console.warn(`[${this.context}] ${message}`, ...args);
		}
	}

	/**
	 * Log error message (failures)
	 */
	error(message: string, error?: Error | unknown, ...args: any[]): void {
		if (this.minLevel <= LogLevel.ERROR) {
			if (error instanceof Error) {
				console.error(`[${this.context}] ${message}`, error.message, error.stack, ...args);
			} else {
				console.error(`[${this.context}] ${message}`, error, ...args);
			}
		}
	}

	/**
	 * Create a child logger with a sub-context
	 */
	child(subContext: string): Logger {
		return new Logger(`${this.context}:${subContext}`, this.minLevel);
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
			this.error(`Failed ${label} after ${duration}ms`, error);
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
