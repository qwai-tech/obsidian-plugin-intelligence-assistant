/**
 * CLI Tool Implementation
 * Executes local command-line tools as agent tools
 */

import { buildSubprocessEnv } from '@/features/tools/subprocess-env';
import type { Tool, ToolDefinition, ToolResult, ToolParameter, ToolExecutionContext } from '@/features/tools/types/tools';
import type { CLIToolConfig, CLIToolParameter } from '@/features/tools/types/cli-tools';
import { DEFAULT_CLI_TIMEOUT } from '@/features/tools/types/cli-tools';
import { createToolDefinition } from '@/features/tools/tool-schema';
import { errorMessage } from '@/core/utils/errors';
import type { CommandRunner } from './process-ports';

export class CLITool implements Tool {
	definition: ToolDefinition;
	provider: string;

	constructor(private config: CLIToolConfig, private readonly runner: CommandRunner) {
		this.config = JSON.parse(JSON.stringify(config)) as CLIToolConfig;
		this.provider = `cli:${config.id}`;
		this.definition = createToolDefinition({
			name: config.name,
			description: config.description,
			parameters: this.convertParameters(config.parameters || []),
			sideEffects: { process: true },
			argumentSources: config.argumentSources,
		});
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
	async execute(args: Record<string, unknown>, context: ToolExecutionContext = {}): Promise<ToolResult> {
		try {
			const { command, commandArgs, env } = this.buildCommand(args);
			const result = await this.runCommand(command, commandArgs, env, context.signal);
			return {
				success: true,
				result
			};
		} catch (error) {
			return {
				success: false,
				error: errorMessage(error)
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
			// Shell templates are trusted configuration, but model-provided data is never shell syntax.
			if (this.config.shell && insertAs !== 'env' && !/^[A-Za-z0-9_./:@%+=,-]*$/.test(stringValue)) throw new Error('Shell parameters with special characters must be passed as environment variables');

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
				if ((param.insertAs ?? 'template') !== 'template') continue;
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

	private async runCommand(
		command: string,
		args: string[],
		env: Record<string, string>,
		signal?: AbortSignal,
	): Promise<string> {
		const { exitCode, stdout, stderr } = await this.runner({
			command,
			args,
			env: buildSubprocessEnv(env),
			cwd: this.config.cwd,
			shell: this.config.shell ?? false,
			signal,
			timeoutMs: this.config.timeout ?? DEFAULT_CLI_TIMEOUT,
		});
		if (exitCode === 0) {
			return stdout.trim() || 'Command completed successfully';
		}
		throw new Error(stderr.trim() || stdout.trim() || `Command exited with code ${String(exitCode ?? 'unknown')}`);
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
