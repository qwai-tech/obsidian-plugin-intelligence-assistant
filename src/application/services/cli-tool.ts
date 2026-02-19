/**
 * CLI Tool Implementation
 * Executes local command-line tools as agent tools
 */

import { spawn } from 'child_process';
import type { Tool, ToolDefinition, ToolResult, ToolParameter } from './types';
import type { CLIToolConfig, CLIToolParameter } from '@/types/features/cli-tools';
import { DEFAULT_CLI_TIMEOUT } from '@/types/features/cli-tools';

export class CLITool implements Tool {
	definition: ToolDefinition;
	provider: string;

	constructor(private config: CLIToolConfig) {
		this.provider = `cli:${config.id}`;
		this.definition = {
			name: config.name,
			description: config.description,
			parameters: this.convertParameters(config.parameters || [])
		};
	}

	/**
	 * Convert CLI tool parameters to standard tool parameters
	 */
	private convertParameters(cliParams: CLIToolParameter[]): ToolParameter[] {
		return cliParams.map(param => ({
			name: param.name,
			type: param.type,
			description: param.description,
			required: param.required ?? false
		}));
	}

	/**
	 * Execute the CLI command with the provided arguments
	 */
	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		try {
			const { command, commandArgs, env } = this.buildCommand(args);
			const result = await this.runCommand(command, commandArgs, env);
			return {
				success: true,
				result
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}

	/**
	 * Build the command, arguments, and environment from configuration and input args
	 */
	private buildCommand(args: Record<string, unknown>): {
		command: string;
		commandArgs: string[];
		env: Record<string, string>;
	} {
		const command = this.config.command;
		const baseArgs = [...(this.config.args || [])];
		const env: Record<string, string> = { ...this.config.env };
		const appendArgs: string[] = [];
		const configParams = this.config.parameters || [];

		// Remap args: if LLM passed a key that does not match any defined parameter,
		// and exactly one defined parameter is still unresolved, use the value for it.
		const resolvedArgs: Record<string, unknown> = { ...args };
		const definedNames = new Set(configParams.map(p => p.name));
		const unmatchedKeys = Object.keys(args).filter(k => !definedNames.has(k));
		const unmatchedParams = configParams.filter(p => !(p.name in args) && p.default === undefined);
		if (unmatchedKeys.length === 1 && unmatchedParams.length === 1) {
			resolvedArgs[unmatchedParams[0].name] = args[unmatchedKeys[0]];
		}

		// Process parameters
		for (const param of configParams) {
			const value = resolvedArgs[param.name];
			const resolvedValue = value !== undefined ? value : param.default;

			if (resolvedValue === undefined) {
				continue;
			}

			const stringValue = this.toStringValue(resolvedValue);
			const insertAs = param.insertAs ?? 'template';

			switch (insertAs) {
				case 'template':
					// Template substitution in args - handled below
					break;
				case 'arg':
					// Append as command-line argument
					appendArgs.push(stringValue);
					break;
				case 'env': {
					// Set as environment variable
					const envName = param.envName || param.name.toUpperCase();
					env[envName] = stringValue;
					break;
				}
			}
		}

		// Perform template substitution in base args
		const processedArgs = baseArgs.map(arg => {
			let result = arg;
			for (const param of configParams) {
				const value = resolvedArgs[param.name];
				const resolvedValue = value !== undefined ? value : param.default;
				if (resolvedValue !== undefined) {
					const placeholder = '{{' + param.name + '}}';
					const stringValue = this.toStringValue(resolvedValue);
					result = result.split(placeholder).join(stringValue);
				}
			}
			// Strip any remaining unsubstituted placeholders
			return result.replace(/\{\{[^}]*\}\}/g, '');
		});

		// Filter out args that became empty after placeholder removal
		const commandArgs = [...processedArgs.filter(a => a !== ''), ...appendArgs];

		return { command, commandArgs, env };
	}

	/**
	 * Run the command using child_process.spawn
	 */
	private async runCommand(
		command: string,
		args: string[],
		env: Record<string, string>
	): Promise<string> {
		return new Promise((resolve, reject) => {
			const timeout = this.config.timeout ?? DEFAULT_CLI_TIMEOUT;
			const useShell = this.config.shell ?? true;
			const cwd = this.config.cwd || process.cwd();

			const proc = spawn(command, args, {
				shell: useShell,
				cwd,
				env: { ...process.env, ...env },
				timeout
			});

			let stdout = '';
			let stderr = '';

			proc.stdout?.on('data', (data: Buffer) => {
				stdout += data.toString();
			});

			proc.stderr?.on('data', (data: Buffer) => {
				stderr += data.toString();
			});

			proc.on('close', (code) => {
				if (code === 0) {
					resolve(stdout.trim() || 'Command completed successfully');
				} else {
					const errorMessage = stderr.trim() || stdout.trim() || `Command exited with code ${String(code ?? 'unknown')}`;
					reject(new Error(errorMessage));
				}
			});

			proc.on('error', (error) => {
				reject(new Error(`Failed to execute command: ${error.message}`));
			});
		});
	}

	/**
	 * Get the CLI tool configuration
	 */
	getConfig(): CLIToolConfig {
		return this.config;
	}

	/**
	 * Convert a value to string in a type-safe manner
	 */
	private toStringValue(value: unknown): string {
		if (value === null || value === undefined) {
			return '';
		}
		if (typeof value === 'string') {
			return value;
		}
		if (typeof value === 'number' || typeof value === 'boolean') {
			return String(value);
		}
		// For objects and other types, use JSON.stringify
		return JSON.stringify(value);
	}
}
