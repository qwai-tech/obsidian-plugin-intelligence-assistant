/**
 * CLI Tool Types
 * Types for local command-line tool execution
 */

/**
 * Configuration for a CLI tool
 */
export interface CLIToolConfig {
	/** Unique identifier for the tool */
	id: string;
	/** Tool name exposed to LLM */
	name: string;
	/** Description for LLM to understand when to use this tool */
	description: string;
	/** Command to execute (e.g., "node", "python", "bash", "/path/to/script") */
	command: string;
	/** Default arguments with {{param}} template support */
	args?: string[];
	/** Static environment variables */
	env?: Record<string, string>;
	/** Working directory for command execution */
	cwd?: string;
	/** Whether the tool is enabled */
	enabled: boolean;
	/** Execution timeout in milliseconds (default: 30000) */
	timeout?: number;
	/** Whether to run in shell (default: true) */
	shell?: boolean;
	/** Input parameters that LLM can provide */
	parameters?: CLIToolParameter[];
}

/**
 * Parameter definition for CLI tool
 */
export interface CLIToolParameter {
	/** Parameter name */
	name: string;
	/** Parameter type */
	type: 'string' | 'number' | 'boolean';
	/** Description for LLM */
	description: string;
	/** Whether the parameter is required */
	required?: boolean;
	/** Default value if not provided */
	default?: string | number | boolean;
	/**
	 * How to pass the parameter to the command:
	 * - 'template': Replace {{param}} placeholder in args (default)
	 * - 'arg': Append as command-line argument
	 * - 'env': Pass as environment variable
	 */
	insertAs?: 'template' | 'arg' | 'env';
	/** Environment variable name (only used when insertAs is 'env') */
	envName?: string;
}

/**
 * Default timeout for CLI tool execution (30 seconds)
 */
export const DEFAULT_CLI_TIMEOUT = 30000;

export interface CLIToolPreset {
	id: string;
	name: string;
	category: 'file' | 'search' | 'network' | 'code' | 'system' | 'data' | 'apps';
	config: Omit<CLIToolConfig, 'id' | 'enabled'>;
	platforms: Array<'darwin' | 'linux' | 'win32'>;
}
