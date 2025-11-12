/**
 * Configuration Schema
 * Validation schema for plugin settings
 */

import type { PluginSettings } from '@/types';
import { DEFAULT_SETTINGS } from '@/types/settings';

export interface ValidationResult {
	valid: boolean;
	errors: ConfigValidationError[];
	warnings: ConfigValidationWarning[];
}

export interface ConfigValidationError {
	path: string;
	message: string;
	value?: any;
}

export interface ConfigValidationWarning {
	path: string;
	message: string;
	suggestion?: string;
}

export class ConfigSchema {
	private static clone<T>(value: T): T {
		return value === undefined ? value : JSON.parse(JSON.stringify(value));
	}

	private static resolve(path: string, source: any): any {
		return path
			.replace(/\[(\d+)\]/g, '.$1')
			.split('.')
			.filter(Boolean)
			.reduce((acc, segment) => (acc ? acc[segment] : undefined), source);
	}

	/**
	 * Validate entire settings object
	 */
	static validate(settings: PluginSettings): ValidationResult {
		const errors: ConfigValidationError[] = [];
		const warnings: ConfigValidationWarning[] = [];

		// Validate LLM configurations
		if (settings.llmConfigs) {
			settings.llmConfigs.forEach((config, index) => {
				if (!config.provider || config.provider.trim() === '') {
					errors.push({
						path: `llmConfigs[${index}].provider`,
						message: 'Provider name is required',
						value: config.provider
					});
				}

				// Validate URL format if baseUrl is provided
				if (config.baseUrl) {
					try {
						new URL(config.baseUrl);
					} catch {
						errors.push({
							path: `llmConfigs[${index}].baseUrl`,
							message: 'Invalid URL format',
							value: config.baseUrl
						});
					}
				}

				// Warn if API key is missing for non-local providers
				if (!config.apiKey && config.baseUrl && !config.baseUrl.includes('localhost') && !config.baseUrl.includes('127.0.0.1')) {
					warnings.push({
						path: `llmConfigs[${index}].apiKey`,
						message: 'API key is recommended for remote providers',
						suggestion: 'Add an API key for authentication'
					});
				}
			});
		}

		// Validate MCP servers
		if (settings.mcpServers) {
			settings.mcpServers.forEach((server, index) => {
				if (!server.name || server.name.trim() === '') {
					errors.push({
						path: `mcpServers[${index}].name`,
						message: 'Server name is required',
						value: server.name
					});
				}

				if (!server.command || server.command.trim() === '') {
					errors.push({
						path: `mcpServers[${index}].command`,
						message: 'Server command is required',
						value: server.command
					});
				}

				// Validate environment variables format
				if (server.env) {
					Object.entries(server.env).forEach(([key, value]) => {
						if (!key || key.trim() === '') {
							warnings.push({
								path: `mcpServers[${index}].env`,
								message: 'Empty environment variable key found',
								suggestion: 'Remove empty keys or provide valid names'
							});
						}
					});
				}
			});
		}

		// Validate agents
		if (settings.agents) {
			settings.agents.forEach((agent, index) => {
				if (!agent.id || agent.id.trim() === '') {
					errors.push({
						path: `agents[${index}].id`,
						message: 'Agent ID is required',
						value: agent.id
					});
				}

				if (!agent.name || agent.name.trim() === '') {
					errors.push({
						path: `agents[${index}].name`,
						message: 'Agent name is required',
						value: agent.name
					});
				}

				if (!agent.modelStrategy || !agent.modelStrategy.strategy) {
					errors.push({
						path: `agents[${index}].modelStrategy`,
						message: 'Agent model strategy is required',
						value: agent.modelStrategy
					});
				} else if (agent.modelStrategy.strategy === 'fixed' && (!agent.modelStrategy.modelId || agent.modelStrategy.modelId.trim() === '')) {
					errors.push({
						path: `agents[${index}].modelStrategy.modelId`,
						message: 'Fixed model ID is required when using fixed model strategy',
						value: agent.modelStrategy.modelId
					});
				}

				// Validate temperature range
				if (agent.temperature !== undefined && (agent.temperature < 0 || agent.temperature > 2)) {
					errors.push({
						path: `agents[${index}].temperature`,
						message: 'Temperature must be between 0 and 2',
						value: agent.temperature
					});
				}

				// Validate max tokens
				if (agent.maxTokens !== undefined && agent.maxTokens < 1) {
					errors.push({
						path: `agents[${index}].maxTokens`,
						message: 'Max tokens must be positive',
						value: agent.maxTokens
					});
				}

				// Validate ReAct configuration
				if (agent.reactEnabled && agent.reactMaxSteps !== undefined && agent.reactMaxSteps < 1) {
					errors.push({
						path: `agents[${index}].reactMaxSteps`,
						message: 'ReAct max steps must be positive',
						value: agent.reactMaxSteps
					});
				}
			});
		}

		// Validate RAG configuration
		if (settings.ragConfig) {
			if (settings.ragConfig.chunkSize !== undefined && settings.ragConfig.chunkSize < 1) {
				errors.push({
					path: 'ragConfig.chunkSize',
					message: 'RAG chunk size must be positive',
					value: settings.ragConfig.chunkSize
				});
			}

			if (settings.ragConfig.chunkOverlap !== undefined && settings.ragConfig.chunkOverlap < 0) {
				errors.push({
					path: 'ragConfig.chunkOverlap',
					message: 'RAG chunk overlap must be non-negative',
					value: settings.ragConfig.chunkOverlap
				});
			}

			if (settings.ragConfig.topK !== undefined && settings.ragConfig.topK < 1) {
				errors.push({
					path: 'ragConfig.topK',
					message: 'RAG topK must be positive',
					value: settings.ragConfig.topK
				});
			}

			if (settings.ragConfig.similarityThreshold !== undefined &&
				(settings.ragConfig.similarityThreshold < 0 || settings.ragConfig.similarityThreshold > 1)) {
				errors.push({
					path: 'ragConfig.similarityThreshold',
					message: 'RAG similarity threshold must be between 0 and 1',
					value: settings.ragConfig.similarityThreshold
				});
			}
		}

		// Validate web search configuration
		if (settings.webSearchConfig) {
			if (settings.webSearchConfig.maxResults !== undefined && settings.webSearchConfig.maxResults < 1) {
				errors.push({
					path: 'webSearchConfig.maxResults',
					message: 'Web search max results must be positive',
					value: settings.webSearchConfig.maxResults
				});
			}
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings
		};
	}

	/**
	 * Validate a specific configuration section
	 */
	static validateSection<K extends keyof PluginSettings>(
		section: K,
		value: PluginSettings[K]
	): ValidationResult {
		const settings = this.clone(DEFAULT_SETTINGS);
		(settings as PluginSettings)[section] = this.clone(value);

		const result = this.validate(settings);
		const prefix = String(section);
		return {
			valid: result.errors.filter(e => e.path.startsWith(prefix)).length === 0,
			errors: result.errors.filter(e => e.path.startsWith(prefix)),
			warnings: result.warnings.filter(w => w.path.startsWith(prefix))
		};
	}

	/**
	 * Get default value for a configuration field
	 */
	static getDefault(path: string): unknown {
		if (!path) return this.clone(DEFAULT_SETTINGS);
		return this.clone(this.resolve(path, DEFAULT_SETTINGS));
	}

	/**
	 * Check if a field is required
	 */
	static isRequired(path: string): boolean {
		const requiredFields = [
			'llmConfigs[].provider',
			'mcpServers[].name',
			'mcpServers[].command',
			'agents[].id',
			'agents[].name',
			'agents[].modelStrategy.strategy',
			'workflows[].id',
			'workflows[].name'
		];

		return requiredFields.some(field => {
			const pattern = field.replace(/\[\]/g, '\\[\\d+\\]');
			return new RegExp(`^${pattern}$`).test(path);
		});
	}

	/**
	 * Get field constraints
	 */
	static getConstraints(path: string): Record<string, any> {
		const constraints: Record<string, Record<string, any>> = {
			'temperature': { min: 0, max: 2, type: 'number' },
			'maxTokens': { min: 1, type: 'number' },
			'chunkSize': { min: 1, type: 'number' },
			'chunkOverlap': { min: 0, type: 'number' },
			'topK': { min: 1, type: 'number' },
			'similarityThreshold': { min: 0, max: 1, type: 'number' },
			'maxResults': { min: 1, type: 'number' },
			'reactMaxSteps': { min: 1, type: 'number' }
		};

		// Extract field name from path
		const parts = path.split('.');
		const fieldName = parts[parts.length - 1];

		return constraints[fieldName] || {};
	}
}
