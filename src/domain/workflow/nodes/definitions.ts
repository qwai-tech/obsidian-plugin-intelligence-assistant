/**
 * Workflow System V2 - Node Definitions
 *
 * Core node implementations for workflow system.
 * Includes essential nodes for triggers, AI, data processing, and logic.
 */

import { Notice, TFile } from 'obsidian';
import type { MetadataCache, RequestUrlParam, Vault } from 'obsidian';

import { ExecutionContext, NodeData, NodeDef, WorkflowAIService } from '../core/types';
import { resolveVariables } from '../core/variable-resolver';
import { getErrorMessage, isRecord } from '@/types/type-utils';
import { nodeRegistry } from './registry';


function toStringSafe(value: unknown, fallback = ''): string {
	if (value === null || value === undefined) return fallback;
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
		return String(value);
	}
	if (typeof value === 'object') {
		try {
			return JSON.stringify(value);
		} catch {
			return fallback;
		}
	}
	return fallback;
}

const EMPTY_OBJECT: Record<string, unknown> = {};
type CacheEntry = { value: unknown; timestamp: number; ttl: number };

function toNumberSafe(value: unknown, fallback = 0): number {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function toBooleanSafe(value: unknown, fallback = false): boolean {
	if (typeof value === 'boolean') return value;
	if (value === 'true') return true;
	if (value === 'false') return false;
	return fallback;
}

function toRecord(value: unknown): Record<string, unknown> {
	return isRecord(value) ? value : { ...EMPTY_OBJECT };
}

function parseJsonValue<T>(value: unknown, fallback: T): T {
	if (typeof value === 'string') {
		try {
			return JSON.parse(value) as T;
		} catch (error) {
			console.warn('Failed to parse JSON value', getErrorMessage(error));
		}
	}
	return (value as T) ?? fallback;
}

function getInputJson(inputs: NodeData[], index = 0): Record<string, unknown> {
	return inputs[index]?.json ?? { ...EMPTY_OBJECT };
}

function getValueByPath(data: Record<string, unknown>, path: string): unknown {
	return path.split('.').reduce<unknown>((current, key) => {
		if (isRecord(current)) {
			return current[key];
		}
		return undefined;
	}, data);
}

function requireVault(context: ExecutionContext): Vault {
	const { vault } = context.services;
	if (!vault) {
		throw new Error('Vault service is not available');
	}
	return vault;
}

function requireMetadataCache(context: ExecutionContext): MetadataCache {
	const metadataCache = context.services.metadataCache ?? context.services.app?.metadataCache;
	if (!metadataCache) {
		throw new Error('Metadata cache is not available');
	}
	return metadataCache;
}

function requireAIService(context: ExecutionContext): WorkflowAIService {
	const aiService = context.services.ai;
	if (!aiService) {
		throw new Error('AI service is not available');
	}
	return aiService;
}

/**
 * Get all available models with provider information
 */
function getAvailableModelsWithProvider(): Promise<{ label: string; value: string }[]> {
	try {
		// For now, return a comprehensive list with provider info
		const defaultModels = [
			// OpenAI models
			{ label: 'OpenAI - GPT-4o', value: 'openai:gpt-4o' },
			{ label: 'OpenAI - GPT-4o Mini', value: 'openai:gpt-4o-mini' },
			{ label: 'OpenAI - GPT-4 Turbo', value: 'openai:gpt-4-turbo' },
			{ label: 'OpenAI - GPT-3.5 Turbo', value: 'openai:gpt-3.5-turbo' },
			{ label: 'OpenAI - O1', value: 'openai:o1' },
			{ label: 'OpenAI - O1 Mini', value: 'openai:o1-mini' },
			{ label: 'OpenAI - O3 Mini', value: 'openai:o3-mini' },
			
			// Anthropic models
			{ label: 'Anthropic - Claude 3.5 Sonnet', value: 'anthropic:claude-3-5-sonnet-20241022' },
			{ label: 'Anthropic - Claude 3.5 Haiku', value: 'anthropic:claude-3-5-haiku-20241022' },
			{ label: 'Anthropic - Claude 3 Opus', value: 'anthropic:claude-3-opus-20240229' },
			{ label: 'Anthropic - Claude 3 Sonnet', value: 'anthropic:claude-3-sonnet-20240229' },
			{ label: 'Anthropic - Claude 3 Haiku', value: 'anthropic:claude-3-haiku-20240307' },
			
			// Google models
			{ label: 'Google - Gemini 2.0 Flash (Experimental)', value: 'google:gemini-2.0-flash-exp' },
			{ label: 'Google - Gemini 2.0 Flash Thinking (Experimental)', value: 'google:gemini-2.0-flash-thinking-exp' },
			{ label: 'Google - Gemini 1.5 Pro', value: 'google:gemini-1.5-pro' },
			{ label: 'Google - Gemini 1.5 Flash', value: 'google:gemini-1.5-flash' },
			{ label: 'Google - Gemini Pro', value: 'google:gemini-pro' },
			
			// DeepSeek models
			{ label: 'DeepSeek - DeepSeek Chat', value: 'deepseek:deepseek-chat' },
			{ label: 'DeepSeek - DeepSeek Reasoner', value: 'deepseek:deepseek-reasoner' },
			{ label: 'DeepSeek - DeepSeek Coder', value: 'deepseek:deepseek-coder' },
			
			// OpenRouter models
			{ label: 'OpenRouter - GPT-4o', value: 'openrouter:openai/gpt-4o' },
			{ label: 'OpenRouter - GPT-4o Mini', value: 'openrouter:openai/gpt-4o-mini' },
			{ label: 'OpenRouter - Claude 3.5 Sonnet', value: 'openrouter:anthropic/claude-3.5-sonnet' },
			{ label: 'OpenRouter - Gemini 1.5 Pro', value: 'openrouter:google/gemini-pro-1.5' },
			{ label: 'OpenRouter - Llama 3.1 70B', value: 'openrouter:meta-llama/llama-3.1-70b-instruct' },
			
			// SAP AI Core models
			{ label: 'SAP AI Core - GPT-4o', value: 'sap-ai-core:gpt-4o' },
			{ label: 'SAP AI Core - GPT-4o Mini', value: 'sap-ai-core:gpt-4o-mini' },
			{ label: 'SAP AI Core - GPT-4 Turbo', value: 'sap-ai-core:gpt-4-turbo' },
			{ label: 'SAP AI Core - GPT-3.5 Turbo', value: 'sap-ai-core:gpt-35-turbo' },
		];

		return defaultModels;
	} catch (error) {
		console.error('Failed to get available models:', error);
		// Fallback to basic models
		return [
			{ label: 'OpenAI - GPT-4o', value: 'openai:gpt-4o' },
			{ label: 'OpenAI - GPT-4o Mini', value: 'openai:gpt-4o-mini' },
			{ label: 'Anthropic - Claude 3.5 Sonnet', value: 'anthropic:claude-3-5-sonnet-20241022' },
			{ label: 'Anthropic - Claude 3.5 Haiku', value: 'anthropic:claude-3-5-haiku-20241022' },
		];
	}
}

// ============================================================================
// TRIGGER NODES
// ============================================================================

/**
 * Start Node - Manual trigger to start workflow
 */
const startNode: NodeDef = {
	type: 'start',
	name: 'Start',
	icon: '▶️',
	color: '#22c55e',
	description: 'Manual trigger to start workflow',
	category: 'trigger',
	canBeStart: true,
	parameters: [
		{
			name: 'input',
			label: 'Input Data',
			type: 'json',
			default: '{}',
			description: 'Initial input data for workflow (JSON format)',
		},
	],
	execute(inputs, config, _context: ExecutionContext) {
		try {
			// Parse input JSON
			const data: unknown = typeof config.input === 'string'
				? JSON.parse(config.input || '{}')
				: config.input || {};

			return [{ json: toRecord(data) }];
		} catch (error) {
			throw new Error(`Failed to parse input data: ${getErrorMessage(error)}`);
		}
	},
};

// ============================================================================
// AI NODES
// ============================================================================

/**
 * LLM Chat Node - Generate text using AI
 */
const llmChatNode: NodeDef = {
	type: 'llm',
	name: 'AI Chat',
	icon: '🤖',
	color: '#3b82f6',
	description: 'Generate text using large language models',
	category: 'ai',
	parameters: [
		{
			name: 'model',
			label: 'Model',
			type: 'select',
			default: 'openai:gpt-4o',
			required: true,
			options: [], // Will be populated dynamically
			description: 'Select AI model to use',
			async getOptions() {
				return await getAvailableModelsWithProvider();
			},
		},
		{
			name: 'prompt',
			label: 'Prompt',
			type: 'textarea',
			default: '',
			required: true,
			placeholder: 'Enter prompt...',
			description: 'Prompt to send to AI. Use {{data}} for full input, {{fieldName}} for specific fields (e.g., {{text}}, {{content}})',
		},
		{
			name: 'systemPrompt',
			label: 'System Prompt',
			type: 'textarea',
			default: 'You are a helpful assistant.',
			placeholder: 'Enter system prompt...',
			description: 'Set AI role and behavior',
		},
		{
			name: 'temperature',
			label: 'Temperature',
			type: 'number',
			default: 0.7,
			description: 'Control output randomness (0-2, higher = more random)',
		},
	],
	async execute(inputs, config, context: ExecutionContext) {
		const { model, prompt, systemPrompt, temperature } = config;

		// Resolve variables in prompt and system prompt
		const finalPrompt = resolveVariables(typeof prompt === 'string' ? prompt : '', inputs);
		const finalSystemPrompt = resolveVariables(typeof systemPrompt === 'string' ? systemPrompt : '', inputs);

		// Call AI service
		if (!context.services.ai) {
			throw new Error('AI service is not available');
		}

		try {
			const modelId = typeof model === 'string' ? model : toStringSafe(model, '');
			const tempNum = typeof temperature === 'number'
				? temperature
				: (typeof temperature === 'string' ? Number(temperature) : undefined);

			const response = await context.services.ai.chat([
				{ role: 'system', content: finalSystemPrompt },
				{ role: 'user', content: finalPrompt },
			], { model: modelId, temperature: tempNum });

			return [{
				json: {
					response,
					model: modelId,
					prompt: finalPrompt,
					systemPrompt: finalSystemPrompt,
				}
			}];
		} catch (error) {
			throw new Error(`AI call failed: ${getErrorMessage(error)}`);
		}
	},
};

// ============================================================================
// DATA NODES
// ============================================================================

/**
 * Transform Node - Transform data using JavaScript
 */
const transformNode: NodeDef = {
	type: 'transform',
	name: 'Transform Data',
	icon: '🔄',
	color: '#10b981',
	description: 'Transform data using JavaScript code',
	category: 'data',
	parameters: [
		{
			name: 'code',
			label: 'JavaScript Code',
			type: 'code',
			default: 'return input;',
			required: true,
			description: 'Transform function, use input to access input data, return transformed data',
		},
	],
	async execute(inputs, config, context: ExecutionContext) {
		const { code } = config;

		try {
			// Import secure execution service
			const { SecureCodeExecutionService } = await import('../services/secure-execution');
			const secureExecutor = SecureCodeExecutionService.getInstance();

			// Transform each input using secure execution
			const results: NodeData[] = [];
			for (const input of inputs) {
				const executionResult = await secureExecutor.executeCode(
					code,
					{ input: input.json, inputs, context },
					context.services,
					{
						timeout: 5000,
						builtinModules: [],
						allowAsync: false,
					}
				);
				
				results.push({ json: toRecord(executionResult.result) });
			}

			return results;
		} catch (error) {
			throw new Error(`Secure code execution failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Filter Node - Filter data items
 */
const filterNode: NodeDef = {
	type: 'filter',
	name: 'Filter Data',
	icon: '🔍',
	color: '#10b981',
	description: 'Filter data items by condition',
	category: 'data',
	parameters: [
		{
			name: 'condition',
			label: 'Filter Condition',
			type: 'code',
			default: 'return true;',
			required: true,
			description: 'Filter function, return true to keep, false to discard',
		},
	],
	async execute(inputs, config, context: ExecutionContext) {
		const { condition } = config;

		try {
			// Import secure execution service
			const { SecureCodeExecutionService } = await import('../services/secure-execution');
			const secureExecutor = SecureCodeExecutionService.getInstance();

			const results: NodeData[] = [];
			for (let i = 0; i < inputs.length; i++) {
				try {
					const executionResult = await secureExecutor.executeCode(
						condition,
						{ input: inputs[i].json, index: i, inputs },
						context.services,
						{
							timeout: 3000,
							builtinModules: [],
							allowAsync: false,
						}
					);
					
					if (executionResult.result) {
						results.push(inputs[i]);
					}
				} catch (error) {
					context.log(`Filter condition execution failed: ${getErrorMessage(error)}`);
				}
			}

			return results;
		} catch (error) {
			throw new Error(`Secure filter failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Merge Node - Merge data from multiple inputs
 */
const mergeNode: NodeDef = {
	type: 'merge',
	name: 'Merge Data',
	icon: '🔗',
	color: '#10b981',
	description: 'Merge data from multiple inputs',
	category: 'data',
	parameters: [
		{
			name: 'mode',
			label: 'Merge Mode',
			type: 'select',
			default: 'combine',
			options: [
				{ label: 'Combine All', value: 'combine' },
				{ label: 'Keep First', value: 'first' },
				{ label: 'Keep Last', value: 'last' },
			],
			description: 'How to merge multiple inputs',
		},
	],
	execute(inputs, config, _context: ExecutionContext) {
		const { mode } = config;

		switch (mode) {
			case 'first':
				return inputs.length > 0 ? [inputs[0]] : [{ json: {} }];

			case 'last':
				return inputs.length > 0 ? [inputs[inputs.length - 1]] : [{ json: {} }];

			case 'combine':
			default:
				return inputs.length > 0 ? inputs : [{ json: {} }];
		}
	},
};

/**
 * Split Node - Split data into individual items
 */
const splitNode: NodeDef = {
	type: 'split',
	name: 'Split Data',
	icon: '✂️',
	color: '#10b981',
	description: 'Split array or text into individual items',
	category: 'data',
	parameters: [
		{
			name: 'splitMode',
			label: 'Split Mode',
			type: 'select',
			default: 'array',
			options: [
				{ label: 'Split Array Field', value: 'array' },
				{ label: 'Split Text by Delimiter', value: 'text' },
			],
			description: 'How to split the data',
		},
		{
			name: 'fieldName',
			label: 'Field Name',
			type: 'string',
			default: 'items',
			placeholder: 'e.g., results, data',
			description: 'Field to split (for array mode) or text field (for text mode)',
		},
		{
			name: 'delimiter',
			label: 'Delimiter (for text mode)',
			type: 'string',
			default: ',',
			placeholder: 'e.g., ,  or \\n',
			description: 'Delimiter to split text by',
		},
	],
	execute(inputs, config, _context: ExecutionContext) {
		const splitMode = typeof config.splitMode === 'string' ? config.splitMode : 'array';
		const fieldName = typeof config.fieldName === 'string' ? config.fieldName : '';
		const delimiter = typeof config.delimiter === 'string' ? config.delimiter : ',';

		if (!fieldName) {
			throw new Error('Field name is required');
		}

		if (!inputs?.length) {
			return [{ json: {} }];
		}

		try {
			const inputRecord = inputs[0]?.json ?? {};
			const targetValue = isRecord(inputRecord) ? inputRecord[fieldName] : undefined;
			const results: NodeData[] = [];

			if (splitMode === 'array') {
				if (!Array.isArray(targetValue)) {
					throw new Error(`Field "${String(fieldName)}" is not an array`);
				}
				for (let i = 0; i < targetValue.length; i++) {
					results.push({
						json: {
							item: targetValue[i],
							index: i,
							total: targetValue.length,
						},
					});
				}
			} else {
				const text = toStringSafe(targetValue);
				const parts = text.split(delimiter).map(part => part.trim()).filter(Boolean);
				for (let i = 0; i < parts.length; i++) {
					results.push({
						json: {
							text: parts[i],
							index: i,
							total: parts.length,
						},
					});
				}
			}

			return results.length > 0 ? results : [{ json: {} }];
		} catch (error) {
			throw new Error(`Split execution failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Aggregate Node - Aggregate data (sum, avg, count, etc.)
 */
const aggregateNode: NodeDef = {
	type: 'aggregate',
	name: 'Aggregate Data',
	icon: '📊',
	color: '#10b981',
	description: 'Aggregate data using various functions',
	category: 'data',
	parameters: [
		{
			name: 'operation',
			label: 'Operation',
			type: 'select',
			default: 'count',
			options: [
				{ label: 'Count', value: 'count' },
				{ label: 'Sum', value: 'sum' },
				{ label: 'Average', value: 'avg' },
				{ label: 'Min', value: 'min' },
				{ label: 'Max', value: 'max' },
				{ label: 'Collect Array', value: 'collect' },
			],
			description: 'Aggregation operation',
		},
		{
			name: 'fieldName',
			label: 'Field Name (for numeric operations)',
			type: 'string',
			default: 'value',
			placeholder: 'e.g., price, score',
			description: 'Field to aggregate (not needed for count)',
		},
	],
	execute(inputs, config, _context: ExecutionContext) {
		const operation = typeof config.operation === 'string' ? config.operation : 'count';
		const fieldName = typeof config.fieldName === 'string' ? config.fieldName : 'value';

		try {
			let result: unknown;

			switch (operation) {
				case 'count':
					result = inputs.length;
					break;

				case 'sum': {
					const values = inputs.map(i => toNumberSafe(i.json[fieldName], 0));
					result = values.reduce((a, b) => a + b, 0);
					break;
				}

				case 'avg': {
					const values = inputs.map(i => toNumberSafe(i.json[fieldName], 0));
					const sum = values.reduce((a, b) => a + b, 0);
					result = values.length > 0 ? sum / values.length : 0;
					break;
				}

				case 'min': {
					const values = inputs.map(i => toNumberSafe(i.json[fieldName], 0));
					result = values.length > 0 ? Math.min(...values) : 0;
					break;
				}

				case 'max': {
					const values = inputs.map(i => toNumberSafe(i.json[fieldName], 0));
					result = values.length > 0 ? Math.max(...values) : 0;
					break;
				}

				case 'collect': {
					result = inputs.map(i => i.json[fieldName]);
					break;
				}

				default:
					result = inputs.length;
			}

			return [{
				json: {
					result,
					operation,
					count: inputs.length,
					fieldName,
				}
			}];
		} catch (error) {
			throw new Error(`Aggregate execution failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Set Variables Node - Set/store variables
 */
const setVariablesNode: NodeDef = {
	type: 'setVariables',
	name: 'Set Variables',
	icon: '📌',
	color: '#10b981',
	description: 'Set variables for later use',
	category: 'data',
	parameters: [
		{
			name: 'variables',
			label: 'Variables (JSON)',
			type: 'json',
			default: JSON.stringify({
				variable1: '{{fieldName}}',
				variable2: 'static value',
			}, null, 2),
			required: true,
			description: 'Key-value pairs of variables to set. Use {{fieldName}} for dynamic values',
		},
	],
	execute(inputs, config, _context: ExecutionContext) {
		const varsConfig = typeof config.variables === 'string'
			? parseJsonValue<Record<string, unknown>>(config.variables, {})
			: toRecord(config.variables);

		try {
			// Resolve all variable values
			const resolvedVars: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(varsConfig)) {
				if (typeof value === 'string') {
					resolvedVars[key] = resolveVariables(value, inputs);
				} else {
					resolvedVars[key] = value;
				}
			}

			return [{
				json: {
					...resolvedVars,
					_variablesSet: Object.keys(resolvedVars),
					_timestamp: Date.now(),
				}
			}];
		} catch (error) {
			throw new Error(`Set variables failed: ${getErrorMessage(error)}`);
		}
	},
};

// ============================================================================
// LOGIC NODES
// ============================================================================

/**
 * Condition Node - Conditional branching
 */
const conditionNode: NodeDef = {
	type: 'condition',
	name: 'Condition',
	icon: '🔀',
	color: '#f59e0b',
	description: 'Conditional branching by condition',
	category: 'logic',
	parameters: [
		{
			name: 'condition',
			label: 'Condition',
			type: 'code',
			default: 'return input.value > 0;',
			required: true,
			description: 'Condition function, return true or false',
		},
	],
	async execute(inputs, config, context: ExecutionContext) {
		const { condition } = config;

		try {
			// Import secure execution service
			const { SecureCodeExecutionService } = await import('../services/secure-execution');
			const secureExecutor = SecureCodeExecutionService.getInstance();

			// Evaluate condition on first input
			const input = inputs[0]?.json || {};
			const executionResult = await secureExecutor.executeCode(
				condition,
				{ input, inputs },
				context.services,
				{
					timeout: 3000,
					builtinModules: [],
					allowAsync: false,
				}
			);

			return [{
				json: {
					...toRecord(input),
					conditionResult: Boolean(executionResult.result),
				}
			}];
		} catch (error) {
			throw new Error(`Secure condition evaluation failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Loop Node - Loop over items
 */
const loopNode: NodeDef = {
	type: 'loop',
	name: 'Loop',
	icon: '🔁',
	color: '#f59e0b',
	description: 'Loop over array items or execute N times',
	category: 'logic',
	parameters: [
		{
			name: 'loopMode',
			label: 'Loop Mode',
			type: 'select',
			default: 'items',
			options: [
				{ label: 'Loop over items', value: 'items' },
				{ label: 'Loop N times', value: 'count' },
			],
			description: 'How to loop',
		},
		{
			name: 'itemsField',
			label: 'Items Field (for items mode)',
			type: 'string',
			default: 'items',
			placeholder: 'e.g., results, data',
			description: 'Field containing array to loop over. Use {{fieldName}} for dynamic field',
		},
		{
			name: 'loopCount',
			label: 'Loop Count (for count mode)',
			type: 'number',
			default: 10,
			description: 'Number of times to loop',
		},
	],
	execute(inputs, config, _context: ExecutionContext) {
		const { loopMode, itemsField, loopCount } = config;

		try {
			const results: NodeData[] = [];

			if (loopMode === 'items') {
				// Loop over items in specified field
				const input = inputs[0]?.json || {};
				const fieldName = resolveVariables(typeof itemsField === 'string' ? itemsField : '', inputs);
				const items = isRecord(input) ? input[fieldName] : undefined;

				if (!Array.isArray(items)) {
					throw new Error(`Field "${fieldName ?? 'unknown'}" is not an array or does not exist`);
				}

				// Output each item as separate data
				for (let i = 0; i < items.length; i++) {
					results.push({
						json: {
							item: items[i],
							index: i,
							total: items.length,
							isFirst: i === 0,
							isLast: i === items.length - 1,
						}
					});
				}
			} else {
				// Loop N times
				const count = Number(loopCount) || 10;
				for (let i = 0; i < count; i++) {
					results.push({
						json: {
							iteration: i,
							total: count,
							isFirst: i === 0,
							isLast: i === count - 1,
						}
					});
				}
			}

			return results;
		} catch (error) {
			throw new Error(`Loop execution failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Switch Node - Multi-branch routing
 */
const switchNode: NodeDef = {
	type: 'switch',
	name: 'Switch',
	icon: '⚡',
	color: '#f59e0b',
	description: 'Route to different branches based on value',
	category: 'logic',
	parameters: [
		{
			name: 'field',
			label: 'Field to Check',
			type: 'string',
			default: 'type',
			required: true,
			placeholder: 'e.g., status, type',
			description: 'Field name to check for routing',
		},
		{
			name: 'cases',
			label: 'Cases (JSON)',
			type: 'json',
			default: JSON.stringify([
				{ value: 'option1', output: 'route1' },
				{ value: 'option2', output: 'route2' },
			], null, 2),
			required: true,
			description: 'Array of {value, output} mappings',
		},
		{
			name: 'defaultOutput',
			label: 'Default Output',
			type: 'string',
			default: 'default',
			description: 'Output when no case matches',
		},
	],
	execute(inputs, config, _context: ExecutionContext) {
		const fieldName = typeof config.field === 'string' ? config.field : '';
		const defaultOutput = typeof config.defaultOutput === 'string' ? config.defaultOutput : 'default';
		const rawCases = typeof config.cases === 'string'
			? parseJsonValue<unknown[]>(config.cases, [])
			: Array.isArray(config.cases) ? config.cases : [];
		const caseArray = rawCases
			.map(caseItem => {
				if (!isRecord(caseItem)) {
					return null;
				}
				const output = typeof caseItem.output === 'string' ? caseItem.output : '';
				return output ? { value: caseItem.value, output } : null;
			})
			.filter((item): item is { value: unknown; output: string } => item !== null);

		try {
			const input = getInputJson(inputs);
			const fieldValue = fieldName ? input[fieldName] : undefined;

			// Find matching case
			const matchedCase = caseArray.find(c => c.value === fieldValue);
			const outputRoute = matchedCase?.output ?? defaultOutput;

			return [{
				json: {
					...input,
					_route: outputRoute,
					_matched: !!matchedCase,
					_fieldValue: fieldValue,
				}
			}];
		} catch (error) {
			throw new Error(`Switch execution failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Delay Node - Add delay to workflow
 */
const delayNode: NodeDef = {
	type: 'delay',
	name: 'Delay',
	icon: '⏱️',
	color: '#f59e0b',
	description: 'Delay workflow execution',
	category: 'logic',
	parameters: [
		{
			name: 'delayTime',
			label: 'Delay Time (seconds)',
			type: 'number',
			default: 1,
			required: true,
			description: 'How many seconds to wait',
		},
	],
	async execute(inputs, config, _context: ExecutionContext) {
		const delayTime = toNumberSafe(config.delayTime, 1);

		try {
			const delayMs = Math.max(delayTime, 0) * 1000;

			// Wait for specified time
			await new Promise(resolve => setTimeout(resolve, delayMs));

			return [{
				json: {
					...(inputs[0]?.json || {}),
					delayedMs: delayMs,
					delayedAt: Date.now(),
				}
			}];
		} catch (error) {
			throw new Error(`Delay execution failed: ${getErrorMessage(error)}`);
		}
	},
};

// ============================================================================
// TOOL NODES
// ============================================================================

/**
 * Create Note Node - Create a note in Obsidian
 */
const createNoteNode: NodeDef = {
	type: 'createNote',
	name: 'Create Note',
	icon: '📝',
	color: '#8b5cf6',
	description: 'Create a new note in Obsidian',
	category: 'tools',
	parameters: [
		{
			name: 'path',
			label: 'Note Path',
			type: 'string',
			default: 'Untitled.md',
			required: true,
			placeholder: 'e.g., Notes/My Note.md',
			description: 'File path for note',
		},
		{
			name: 'content',
			label: 'Note Content',
			type: 'textarea',
			default: '',
			required: true,
			placeholder: 'Enter note content...',
			description: 'Note content. Use {{data}} for full input, {{fieldName}} for specific fields (e.g., {{text}}, {{response}})',
		},
	],
	async execute(inputs, config, context: ExecutionContext) {
		const pathTemplate = typeof config.path === 'string' ? config.path : 'Untitled.md';
		const contentTemplate = typeof config.content === 'string' ? config.content : '';

		// Resolve variables in path and content
		const finalPath = String(resolveVariables(pathTemplate, inputs));
		const finalContent = String(resolveVariables(contentTemplate, inputs));

		try {
			const vault = requireVault(context);
			const file = await vault.create(finalPath, finalContent);

			return [{
				json: {
					path: file.path,
					created: true,
					timestamp: Date.now(),
				}
			}];
		} catch (error) {
			throw new Error(`Note creation failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Read Note Node - Read note content from Obsidian
 */
const readNoteNode: NodeDef = {
	type: 'readNote',
	name: 'Read Note',
	icon: '📖',
	color: '#8b5cf6',
	description: 'Read content from an existing note',
	category: 'tools',
	parameters: [
		{
			name: 'path',
			label: 'Note Path',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'e.g., Notes/My Note.md',
			description: 'Path to the note to read. Use {{fieldName}} for dynamic paths',
		},
		{
			name: 'includeFrontmatter',
			label: 'Include Frontmatter',
			type: 'boolean',
			default: true,
			description: 'Parse and include YAML frontmatter as separate field',
		},
	],
	async execute(inputs, config, context: ExecutionContext) {
		const { path, includeFrontmatter } = config;

		// Resolve variables in path
		const finalPath = String(resolveVariables(typeof path === 'string' ? path : '', inputs));

		try {
			const vault = requireVault(context);

			// Get the file
			const file = vault.getAbstractFileByPath(finalPath);
			if (!(file instanceof TFile)) {
				throw new Error(`Note not found: ${finalPath}`);
			}

			// Read content
			const content = await vault.read(file);

			// Parse frontmatter if requested
			let frontmatter: Record<string, unknown> = {};
			let bodyContent = content;

			if (includeFrontmatter) {
				const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
				const match = content.match(frontmatterRegex);

				if (match && match[1] && match[2]) {
					try {
						// Simple YAML parsing for common cases
						const yamlText = match[1];
						const lines = yamlText.split('\n');
						for (const line of lines) {
							const colonIndex = line.indexOf(':');
							if (colonIndex > 0) {
								const key = line.substring(0, colonIndex).trim();
								let valueStr = line.substring(colonIndex + 1).trim();
								let value: unknown = valueStr;

								// Remove quotes
								if ((valueStr.startsWith('"') && valueStr.endsWith('"')) ||
								    (valueStr.startsWith("'") && valueStr.endsWith("'"))) {
									value = valueStr.slice(1, -1);
								}
								// Parse arrays
								else if (valueStr.startsWith('[') && valueStr.endsWith(']')) {
									value = valueStr.slice(1, -1).split(',').map((v: string) => v.trim());
								}
								// Parse numbers
								else if (!isNaN(Number(valueStr)) && valueStr !== '') {
									value = Number(valueStr);
								}

								frontmatter[key] = value;
							}
						}
						bodyContent = match[2];
					} catch (error) {
						context.log(`Failed to parse frontmatter: ${getErrorMessage(error)}`);
					}
				}
			}

			// Extract tags from content
			const tagMatches = content.matchAll(/#[\w/-]+/g);
			const tags = Array.from(tagMatches).map((m: RegExpMatchArray) => m[0]);

			return [{
				json: {
					content: bodyContent.trim(),
					fullContent: content,
					frontmatter,
					path: finalPath,
					name: file.name,
					basename: file.basename,
					tags,
				}
			}];
		} catch (error) {
			throw new Error(`Failed to read note: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Update Note Node - Update existing note
 */
const updateNoteNode: NodeDef = {
	type: 'updateNote',
	name: 'Update Note',
	icon: '🔄',
	color: '#8b5cf6',
	description: 'Update content of an existing note',
	category: 'tools',
	parameters: [
		{
			name: 'path',
			label: 'Note Path',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'e.g., Notes/My Note.md',
			description: 'Path to the note to update. Use {{fieldName}} for dynamic paths',
		},
		{
			name: 'mode',
			label: 'Update Mode',
			type: 'select',
			default: 'append',
			options: [
				{ label: 'Append - Add to end', value: 'append' },
				{ label: 'Prepend - Add to beginning', value: 'prepend' },
				{ label: 'Replace - Replace entire content', value: 'replace' },
			],
			description: 'How to update the note content',
		},
		{
			name: 'content',
			label: 'Content',
			type: 'textarea',
			default: '',
			required: true,
			placeholder: 'Enter content to add...',
			description: 'Content to add/replace. Use {{data}} for full input, {{fieldName}} for specific fields',
		},
		{
			name: 'separator',
			label: 'Separator',
			type: 'string',
			default: '\n\n',
			description: 'Separator between existing and new content (for append/prepend)',
		},
	],
	async execute(inputs, config, context: ExecutionContext) {
		const { path, mode, content, separator } = config;

		// Resolve variables
		const finalPath = String(resolveVariables(typeof path === 'string' ? path : '', inputs));
		const finalContent = String(resolveVariables(typeof content === 'string' ? content : '', inputs));
		const finalSeparator = String(resolveVariables(typeof separator === 'string' ? separator : '\n\n', inputs));

		try {
			const vault = requireVault(context);

			// Get the file
			const file = vault.getAbstractFileByPath(finalPath);
			if (!(file instanceof TFile)) {
				throw new Error(`Note not found: ${finalPath}`);
			}

			// Read existing content
			const existingContent = await vault.read(file);

			// Calculate new content based on mode
			let newContent: string;
			switch (mode) {
				case 'append':
					newContent = existingContent + finalSeparator + finalContent;
					break;
				case 'prepend':
					newContent = finalContent + finalSeparator + existingContent;
					break;
				case 'replace':
					newContent = finalContent;
					break;
				default:
					newContent = existingContent + finalSeparator + finalContent;
			}

			// Update the file
			await vault.modify(file, newContent);

			return [{
				json: {
					path: finalPath,
					updated: true,
					mode,
					timestamp: Date.now(),
					previousLength: existingContent.length,
					newLength: newContent.length,
				}
			}];
		} catch (error) {
			throw new Error(`Failed to update note: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Search Notes Node - Search notes in vault
 */
const searchNotesNode: NodeDef = {
	type: 'searchNotes',
	name: 'Search Notes',
	icon: '🔎',
	color: '#8b5cf6',
	description: 'Search for notes in the vault',
	category: 'tools',
	parameters: [
		{
			name: 'query',
			label: 'Search Query',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'Enter search query...',
			description: 'Search query. Use {{fieldName}} for dynamic search',
		},
		{
			name: 'searchIn',
			label: 'Search In',
			type: 'select',
			default: 'all',
			options: [
				{ label: 'All Fields', value: 'all' },
				{ label: 'File Name Only', value: 'filename' },
				{ label: 'Content Only', value: 'content' },
				{ label: 'Tags Only', value: 'tags' },
			],
			description: 'Where to search',
		},
		{
			name: 'folder',
			label: 'Folder Filter (Optional)',
			type: 'string',
			default: '',
			placeholder: 'e.g., Notes/',
			description: 'Only search in this folder (leave empty for all)',
		},
		{
			name: 'limit',
			label: 'Max Results',
			type: 'number',
			default: 10,
			description: 'Maximum number of results to return',
		},
	],
	async execute(inputs, config, context: ExecutionContext) {
		const queryTemplate = typeof config.query === 'string' ? config.query : '';
		const searchInValue = typeof config.searchIn === 'string' ? config.searchIn : 'all';
		const folderTemplate = typeof config.folder === 'string' ? config.folder : '';
		const limitValue = Math.max(1, toNumberSafe(config.limit, 10));

		// Resolve variables
		const finalQuery = String(resolveVariables(queryTemplate, inputs)).toLowerCase();
		const finalFolder = String(resolveVariables(folderTemplate, inputs));

		try {
			const vault = requireVault(context);

			// Get all markdown files
			const files = vault.getMarkdownFiles();

			const results: Array<{
				path: string;
				name: string;
				basename: string;
				excerpt: string;
				score: number;
			}> = [];

			for (const file of files) {
				// Apply folder filter if specified
				if (finalFolder && !file.path.startsWith(finalFolder)) {
					continue;
				}

				let score = 0;
				let matchedContent = '';

				// Search in filename
				if (searchInValue === 'all' || searchInValue === 'filename') {
					if (file.basename.toLowerCase().includes(finalQuery)) {
						score += 10;
					}
				}

				// Search in content or tags
				if (searchInValue === 'all' || searchInValue === 'content' || searchInValue === 'tags') {
					const content = await vault.read(file);

					if (searchInValue === 'tags' || searchInValue === 'all') {
						// Check tags
						const tagMatches = content.matchAll(/#[\w/-]+/g);
						const tags = Array.from(tagMatches).map((m: RegExpMatchArray) => m[0]);
						if (tags.some(tag => tag.toLowerCase().includes(finalQuery))) {
							score += 8;
						}
					}

					if (searchInValue === 'content' || searchInValue === 'all') {
						// Check content
						const contentLower = content.toLowerCase();
						if (contentLower.includes(finalQuery)) {
							score += 5;

							// Extract excerpt around the match
							const index = contentLower.indexOf(finalQuery);
							const start = Math.max(0, index - 50);
							const end = Math.min(content.length, index + finalQuery.length + 50);
							matchedContent = '...' + content.substring(start, end).trim() + '...';
						}
					}
				}

				// Add to results if matched
				if (score > 0) {
					results.push({
						path: file.path,
						name: file.name,
						basename: file.basename,
						excerpt: matchedContent || file.basename,
						score,
					});
				}
			}

			// Sort by score (highest first) and limit results
			results.sort((a, b) => b.score - a.score);
			const limitedResults = results.slice(0, limitValue);

			return [{
				json: {
					results: limitedResults,
					count: limitedResults.length,
					totalMatches: results.length,
					query: finalQuery,
				}
			}];
		} catch (error) {
			throw new Error(`Failed to search notes: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Daily Note Node - Get or create daily note
 */
const dailyNoteNode: NodeDef = {
	type: 'dailyNote',
	name: 'Daily Note',
	icon: '📅',
	color: '#8b5cf6',
	description: 'Get or create daily note',
	category: 'tools',
	parameters: [
		{
			name: 'dateOffset',
			label: 'Date Offset',
			type: 'number',
			default: 0,
			description: 'Days offset from today (0=today, -1=yesterday, 1=tomorrow)',
		},
		{
			name: 'folder',
			label: 'Daily Notes Folder',
			type: 'string',
			default: '',
			placeholder: 'e.g., Daily Notes/',
			description: 'Folder for daily notes (leave empty for vault root)',
		},
		{
			name: 'format',
			label: 'Date Format',
			type: 'string',
			default: 'YYYY-MM-DD',
			placeholder: 'e.g., YYYY-MM-DD',
			description: 'Date format for filename (YYYY=year, MM=month, DD=day)',
		},
		{
			name: 'template',
			label: 'Template (if creating)',
			type: 'textarea',
			default: '# {{date}}\n\n',
			placeholder: 'Enter template...',
			description: 'Template to use when creating new daily note. Use {{date}} for the date',
		},
	],
	async execute(inputs, config, context: ExecutionContext) {
		const dateOffsetValue = toNumberSafe(config.dateOffset, 0);
		const folderValue = typeof config.folder === 'string' ? config.folder : '';
		const formatValue = typeof config.format === 'string' ? config.format : 'YYYY-MM-DD';
		const templateValue = typeof config.template === 'string' ? config.template : '# {{date}}\n\n';

		try {
			const vault = requireVault(context);

			// Calculate target date
			const targetDate = new Date();
			targetDate.setDate(targetDate.getDate() + dateOffsetValue);

			// Format date for filename
			const year = targetDate.getFullYear();
			const month = String(targetDate.getMonth() + 1).padStart(2, '0');
			const day = String(targetDate.getDate()).padStart(2, '0');

			let dateStr = formatValue || 'YYYY-MM-DD';
			dateStr = dateStr.replace('YYYY', String(year));
			dateStr = dateStr.replace('MM', month);
			dateStr = dateStr.replace('DD', day);

			// Construct path
			const folderPath = folderValue ? folderValue.replace(/\/$/, '') + '/' : '';
			const notePath = `${folderPath}${dateStr}.md`;

			// Check if daily note exists
			let file = vault.getAbstractFileByPath(notePath);
			let isNew = false;
			let content = '';

			if (!file) {
				// Create new daily note
				isNew = true;
				const templateContent = templateValue || '# {{date}}\n\n';
				content = templateContent.replace(/\{\{date\}\}/g, dateStr);

				file = await vault.create(notePath, content);
			} else if (file instanceof TFile) {
				// Read existing content
				content = await vault.read(file);
			} else {
				throw new Error(`Daily note path exists but is not a file: ${notePath}`);
			}

			return [{
				json: {
					path: notePath,
					date: dateStr,
					fullDate: targetDate.toISOString(),
					content,
					isNew,
					timestamp: Date.now(),
				}
			}];
		} catch (error) {
			throw new Error(`Failed to get/create daily note: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * HTTP Request Node - Make HTTP requests
 */
const httpRequestNode: NodeDef = {
	type: 'httpRequest',
	name: 'HTTP Request',
	icon: '🌐',
	color: '#8b5cf6',
	description: 'Send HTTP requests',
	category: 'tools',
	parameters: [
		{
			name: 'url',
			label: 'URL',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'https://api.example.com/data',
			description: 'Request URL',
		},
		{
			name: 'method',
			label: 'Request Method',
			type: 'select',
			default: 'GET',
			options: [
				{ label: 'GET', value: 'GET' },
				{ label: 'POST', value: 'POST' },
				{ label: 'PUT', value: 'PUT' },
				{ label: 'DELETE', value: 'DELETE' },
			],
			description: 'HTTP request method',
		},
		{
			name: 'body',
			label: 'Request Body',
			type: 'json',
			default: '{}',
			description: 'Request body for POST/PUT (JSON format)',
		},
	],
	async execute(inputs, config, context: ExecutionContext) {
		const urlTemplate = typeof config.url === 'string' ? config.url : '';
		const methodValue = typeof config.method === 'string' ? config.method.toUpperCase() : 'GET';
		const bodyValue = config.body ?? {};

		const httpService = context.services.http;
		if (!httpService) {
			throw new Error('HTTP service is not available');
		}

		try {
			const resolvedUrl = String(resolveVariables(urlTemplate, inputs));
			const options: RequestUrlParam = { url: resolvedUrl, method: methodValue as RequestUrlParam['method'] };

			if (methodValue === 'POST' || methodValue === 'PUT' || methodValue === 'PATCH') {
				const payload = typeof bodyValue === 'string' ? bodyValue : JSON.stringify(bodyValue);
				options.body = payload;
				options.headers = { 'Content-Type': 'application/json' };
			}

			const response = await httpService.request(resolvedUrl, options);

			let data: unknown;
			try {
				data = JSON.parse(response.text);
			} catch {
				data = response.text;
			}

			return [{
				json: {
					status: response.status,
					data,
					url: resolvedUrl,
					method: methodValue,
				}
			}];
		} catch (error) {
			throw new Error(`HTTP request failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * JSON Parse Node - Parse JSON string
 */
const jsonParseNode: NodeDef = {
	type: 'jsonParse',
	name: 'JSON Parse',
	icon: '📄',
	color: '#8b5cf6',
	description: 'Parse JSON string to object',
	category: 'data',
	parameters: [
		{
			name: 'field',
			label: 'Field Name',
			type: 'string',
			default: 'json',
			placeholder: 'e.g., data, response',
			description: 'Field containing JSON string',
		},
	],
	execute(inputs, config, _context: ExecutionContext) {
		const fieldName = typeof config.field === 'string' ? config.field : 'json';

		try {
			const input = getInputJson(inputs);
			const jsonString = input[fieldName];

			if (typeof jsonString !== 'string') {
				throw new Error(`Field "${fieldName ?? 'unknown'}" is not a string`);
			}

			const parsed = JSON.parse(jsonString) as unknown;

			return [{
				json: {
					...input,
					[`${fieldName ?? 'unknown'}_parsed`]: parsed,
					_originalField: fieldName,
				}
			}];
		} catch (error) {
			throw new Error(`JSON parse failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * JSON Stringify Node - Convert object to JSON string
 */
const jsonStringifyNode: NodeDef = {
	type: 'jsonStringify',
	name: 'JSON Stringify',
	icon: '📝',
	color: '#8b5cf6',
	description: 'Convert object to JSON string',
	category: 'data',
	parameters: [
		{
			name: 'field',
			label: 'Field Name (optional)',
			type: 'string',
			default: '',
			placeholder: 'Leave empty for entire input',
			description: 'Specific field to stringify, or empty for whole object',
		},
		{
			name: 'pretty',
			label: 'Pretty Print',
			type: 'boolean',
			default: false,
			description: 'Format with indentation',
		},
	],
	execute(inputs, config, _context: ExecutionContext) {
		const fieldName = typeof config.field === 'string' ? config.field : '';
		const prettyPrint = toBooleanSafe(config.pretty, false);

		try {
			const input = getInputJson(inputs);
			const dataToStringify = fieldName ? input[fieldName] : input;

			const jsonString = prettyPrint
				? JSON.stringify(dataToStringify, null, 2)
				: JSON.stringify(dataToStringify);

			return [{
				json: {
					jsonString,
					length: jsonString.length,
					_originalField: fieldName || 'entire input',
				}
			}];
		} catch (error) {
			throw new Error(`JSON stringify failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * String Manipulation Node - Various string operations
 */
const stringNode: NodeDef = {
	type: 'string',
	name: 'String Operations',
	icon: '✍️',
	color: '#8b5cf6',
	description: 'Perform string operations',
	category: 'data',
	parameters: [
		{
			name: 'operation',
			label: 'Operation',
			type: 'select',
			default: 'uppercase',
			options: [
				{ label: 'Uppercase', value: 'uppercase' },
				{ label: 'Lowercase', value: 'lowercase' },
				{ label: 'Trim', value: 'trim' },
				{ label: 'Replace', value: 'replace' },
				{ label: 'Substring', value: 'substring' },
				{ label: 'Length', value: 'length' },
				{ label: 'Concat', value: 'concat' },
			],
			description: 'String operation to perform',
		},
		{
			name: 'field',
			label: 'Field Name',
			type: 'string',
			default: 'text',
			placeholder: 'e.g., content, message',
			description: 'Field containing string',
		},
		{
			name: 'searchValue',
			label: 'Search Value (for replace)',
			type: 'string',
			default: '',
			description: 'Value to search for (replace operation)',
		},
		{
			name: 'replaceValue',
			label: 'Replace With (for replace)',
			type: 'string',
			default: '',
			description: 'Replacement value (replace operation)',
		},
		{
			name: 'start',
			label: 'Start Position (for substring)',
			type: 'number',
			default: 0,
			description: 'Start index (substring operation)',
		},
		{
			name: 'length',
			label: 'Length (for substring)',
			type: 'number',
			default: 10,
			description: 'Length to extract (substring operation)',
		},
		{
			name: 'concatValue',
			label: 'Concat Value',
			type: 'string',
			default: '',
			description: 'Value to concatenate (concat operation)',
		},
	],
	execute(inputs, config, _context: ExecutionContext) {
		const operationValue = typeof config.operation === 'string' ? config.operation : 'uppercase';
		const fieldName = typeof config.field === 'string' ? config.field : 'text';
		const searchValueText = typeof config.searchValue === 'string' ? config.searchValue : '';
		const replaceValueText = typeof config.replaceValue === 'string' ? config.replaceValue : '';
		const startIndex = Math.max(0, toNumberSafe(config.start, 0));
		const lengthValue = Math.max(0, toNumberSafe(config.length, 10));
		const concatValueText = typeof config.concatValue === 'string' ? config.concatValue : '';

		try {
			const input = getInputJson(inputs);
			const sourceValue = input[fieldName];
			const text = typeof sourceValue === 'string' ? sourceValue : toStringSafe(sourceValue, '');
			let result: unknown;

			switch (operationValue) {
				case 'uppercase':
					result = text.toUpperCase();
					break;
				case 'lowercase':
					result = text.toLowerCase();
					break;
				case 'trim':
					result = text.trim();
					break;
				case 'replace':
					result = text.replace(new RegExp(searchValueText, 'g'), replaceValueText);
					break;
				case 'substring':
					result = text.substring(startIndex, startIndex + lengthValue);
					break;
				case 'length':
					result = text.length;
					break;
				case 'concat':
					result = text + concatValueText;
					break;
				default:
					result = text;
			}

			return [{
				json: {
					result,
					operation: operationValue,
					originalLength: text.length,
					_field: fieldName,
				}
			}];
		} catch (error) {
			throw new Error(`String operation failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Date/Time Node - Date and time operations
 */
const dateTimeNode: NodeDef = {
	type: 'dateTime',
	name: 'Date/Time',
	icon: '📆',
	color: '#8b5cf6',
	description: 'Date and time operations',
	category: 'data',
	parameters: [
		{
			name: 'operation',
			label: 'Operation',
			type: 'select',
			default: 'now',
			options: [
				{ label: 'Current Date/Time', value: 'now' },
				{ label: 'Format Date', value: 'format' },
				{ label: 'Parse Date', value: 'parse' },
				{ label: 'Add/Subtract', value: 'math' },
			],
			description: 'Date/time operation',
		},
		{
			name: 'dateField',
			label: 'Date Field (for format/parse)',
			type: 'string',
			default: 'date',
			description: 'Field containing date',
		},
		{
			name: 'format',
			label: 'Format String',
			type: 'string',
			default: 'YYYY-MM-DD',
			placeholder: 'e.g., YYYY-MM-DD HH:mm:ss',
			description: 'Date format (YYYY=year, MM=month, DD=day, HH=hour, mm=minute, ss=second)',
		},
		{
			name: 'amount',
			label: 'Amount (for add/subtract)',
			type: 'number',
			default: 0,
			description: 'Number to add (positive) or subtract (negative)',
		},
		{
			name: 'unit',
			label: 'Unit (for add/subtract)',
			type: 'select',
			default: 'days',
			options: [
				{ label: 'Days', value: 'days' },
				{ label: 'Hours', value: 'hours' },
				{ label: 'Minutes', value: 'minutes' },
				{ label: 'Seconds', value: 'seconds' },
			],
			description: 'Time unit',
		},
	],
	execute(inputs, config, _context: ExecutionContext) {
		const operationValue = typeof config.operation === 'string' ? config.operation : 'now';
		const dateFieldName = typeof config.dateField === 'string' ? config.dateField : 'date';
		const formatValue = typeof config.format === 'string' ? config.format : 'YYYY-MM-DD';
		const amountValue = toNumberSafe(config.amount, 0);
		const unitValue = typeof config.unit === 'string' ? config.unit : 'days';

		try {
			const input = getInputJson(inputs);
			let result: unknown;

			if (operationValue === 'now') {
				const now = new Date();
				result = {
					timestamp: now.getTime(),
					iso: now.toISOString(),
					formatted: formatDate(now, formatValue),
				};
			} else if (operationValue === 'format') {
				const dateValue = input[dateFieldName];
				const date = new Date(dateValue as string);
				result = formatDate(date, formatValue);
			} else if (operationValue === 'parse') {
				const dateString = input[dateFieldName];
				const date = new Date(dateString as string);
				result = {
					timestamp: date.getTime(),
					iso: date.toISOString(),
					valid: !isNaN(date.getTime()),
				};
			} else if (operationValue === 'math') {
				const dateValue = input[dateFieldName] || new Date();
				const date = new Date(dateValue as unknown as string);

				const multipliers: Record<string, number> = {
					seconds: 1000,
					minutes: 60 * 1000,
					hours: 60 * 60 * 1000,
					days: 24 * 60 * 60 * 1000,
				};

				const offset = amountValue * (multipliers[unitValue] || multipliers.days);
				const newDate = new Date(date.getTime() + offset);

				result = {
					timestamp: newDate.getTime(),
					iso: newDate.toISOString(),
					formatted: formatDate(newDate, formatValue),
				};
			}

			return [{
				json: {
					result,
					operation: operationValue,
					_originalDate: input[dateFieldName],
				}
			}];
		} catch (error) {
			throw new Error(`Date/time operation failed: ${getErrorMessage(error)}`);
		}
	},
};

// Helper function for date formatting
function formatDate(date: Date, format: string): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	const seconds = String(date.getSeconds()).padStart(2, '0');

	return format
		.replace('YYYY', String(year))
		.replace('MM', month)
		.replace('DD', day)
		.replace('HH', hours)
		.replace('mm', minutes)
		.replace('ss', seconds);
}

/**
 * Math Operations Node - Mathematical calculations
 */

const mathNode: NodeDef = {
	type: 'math',
	name: 'Math Operations',
	icon: '🔢',
	color: '#8b5cf6',
	description: 'Perform mathematical calculations',
	category: 'data',
	parameters: [
		{
			name: 'operation',
			label: 'Operation',
			type: 'select',
			default: 'add',
			options: [
				{ label: 'Add (+)', value: 'add' },
				{ label: 'Subtract (-)', value: 'subtract' },
				{ label: 'Multiply (*)', value: 'multiply' },
				{ label: 'Divide (/)', value: 'divide' },
				{ label: 'Modulo (%)', value: 'modulo' },
				{ label: 'Power (^)', value: 'power' },
				{ label: 'Square Root', value: 'sqrt' },
				{ label: 'Absolute Value', value: 'abs' },
				{ label: 'Round', value: 'round' },
				{ label: 'Floor', value: 'floor' },
				{ label: 'Ceiling', value: 'ceil' },
			],
			description: 'Mathematical operation',
		},
		{
			name: 'field1',
			label: 'First Value/Field',
			type: 'string',
			default: '0',
			placeholder: 'e.g., price or {{price}}',
			description: 'First operand (field name or number). Use {{field}} for variables',
		},
		{
			name: 'field2',
			label: 'Second Value/Field',
			type: 'string',
			default: '0',
			placeholder: 'e.g., quantity or {{quantity}}',
			description: 'Second operand (field name or number, not used for unary operations)',
		},
	],
	execute(inputs, config, _context: ExecutionContext) {
		const { operation, field1, field2 } = config;

		try {
			// Resolve variable values
			const value1Str = resolveVariables(typeof field1 === 'string' ? field1 : '', inputs);
			const value2Str = resolveVariables(typeof field2 === 'string' ? field2 : '', inputs);

			const value1 = Number(value1Str) || 0;
			const value2 = Number(value2Str) || 0;

			let result: number;

			switch (operation) {
				case 'add':
					result = value1 + value2;
					break;
				case 'subtract':
					result = value1 - value2;
					break;
				case 'multiply':
					result = value1 * value2;
					break;
				case 'divide':
					if (value2 === 0) throw new Error('Division by zero');
					result = value1 / value2;
					break;
				case 'modulo':
					result = value1 % value2;
					break;
				case 'power':
					result = Math.pow(value1, value2);
					break;
				case 'sqrt':
					result = Math.sqrt(value1);
					break;
				case 'abs':
					result = Math.abs(value1);
					break;
				case 'round':
					result = Math.round(value1);
					break;
				case 'floor':
					result = Math.floor(value1);
					break;
				case 'ceil':
					result = Math.ceil(value1);
					break;
				default:
					result = value1;
			}

			return [{
				json: {
					result,
					operation,
					operand1: value1,
					operand2: value2,
				}
			}];
		} catch (error) {
			throw new Error(`Math operation failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Manage Tags Node - Add/remove tags in notes
 */
const manageTagsNode: NodeDef = {
	type: 'manageTags',
	name: 'Manage Tags',
	icon: '🏷️',
	color: '#8b5cf6',
	description: 'Add or remove tags in notes',
	category: 'tools',
	parameters: [
		{
			name: 'path',
			label: 'Note Path',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'e.g., Notes/My Note.md',
			description: 'Path to the note. Use {{fieldName}} for dynamic paths',
		},
		{
			name: 'operation',
			label: 'Operation',
			type: 'select',
			default: 'add',
			options: [
				{ label: 'Add Tags', value: 'add' },
				{ label: 'Remove Tags', value: 'remove' },
				{ label: 'Replace All Tags', value: 'replace' },
				{ label: 'List Tags', value: 'list' },
			],
			description: 'Tag operation to perform',
		},
		{
			name: 'tags',
			label: 'Tags',
			type: 'string',
			default: '',
			placeholder: 'e.g., #tag1 #tag2 or tag1, tag2',
			description: 'Tags to add/remove (comma or space separated). Use {{fieldName}} for dynamic tags',
		},
	],
	async execute(inputs, config, context: ExecutionContext) {
		const { path, operation, tags } = config;

		try {
			const vault = requireVault(context);
			const finalPath = String(resolveVariables(typeof path === 'string' ? path : '', inputs));

			// Get the file
			const file = vault.getAbstractFileByPath(finalPath);
			if (!(file instanceof TFile)) {
				throw new Error(`Note not found: ${finalPath}`);
			}

			// Read content
			let content = await vault.read(file);

			// Parse tags input
			const tagsStr = String(resolveVariables(typeof tags === 'string' ? tags : '', inputs));
			const newTags = tagsStr
				.split(/[,\s]+/)
				.map(t => t.trim())
				.filter(t => t)
				.map(t => t.startsWith('#') ? t : `#${t}`);

			// Extract existing tags
			const tagMatches = content.matchAll(/#[\w/-]+/g);
			const existingTags = Array.from(tagMatches).map((m: RegExpMatchArray) => m[0]);

			let resultTags: string[] = [];
			let modified = false;

			if (operation === 'add') {
				// Add tags that don't exist
				const tagsToAdd = newTags.filter(t => !existingTags.includes(t));
				if (tagsToAdd.length > 0) {
					content = content + '\n\n' + tagsToAdd.join(' ');
					resultTags = [...existingTags, ...tagsToAdd];
					modified = true;
				} else {
					resultTags = existingTags;
				}
			} else if (operation === 'remove') {
				// Remove specified tags
				for (const tag of newTags) {
					const regex = new RegExp(`\\s*${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'g');
					content = content.replace(regex, ' ');
				}
				const updatedMatches = content.matchAll(/#[\w/-]+/g);
				resultTags = Array.from(updatedMatches).map((m: RegExpMatchArray) => m[0]);
				modified = existingTags.length !== resultTags.length;
			} else if (operation === 'replace') {
				// Remove all existing tags
				for (const tag of existingTags) {
					const regex = new RegExp(`\\s*${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'g');
					content = content.replace(regex, ' ');
				}
				// Add new tags
				content = content.trim() + '\n\n' + newTags.join(' ');
				resultTags = newTags;
				modified = true;
			} else if (operation === 'list') {
				// Just list existing tags
				resultTags = existingTags;
			}

			// Save if modified
			if (modified && operation !== 'list') {
				await vault.modify(file, content.trim());
			}

			return [{
				json: {
					path: finalPath,
					operation,
					tags: resultTags,
					tagsAdded: operation === 'add' ? newTags.filter(t => !existingTags.includes(t)) : [],
					tagsRemoved: operation === 'remove' ? newTags : [],
					modified,
				}
			}];
		} catch (error) {
			throw new Error(`Manage tags failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Manage Links Node - Create and manage links
 */
const manageLinksNode: NodeDef = {
	type: 'manageLinks',
	name: 'Manage Links',
	icon: '🔗',
	color: '#8b5cf6',
	description: 'Create and manage note links',
	category: 'tools',
	parameters: [
		{
			name: 'operation',
			label: 'Operation',
			type: 'select',
			default: 'getBacklinks',
			options: [
				{ label: 'Get Backlinks', value: 'getBacklinks' },
				{ label: 'Get Outgoing Links', value: 'getOutgoing' },
				{ label: 'Create Link', value: 'createLink' },
			],
			description: 'Link operation',
		},
		{
			name: 'path',
			label: 'Note Path',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'e.g., Notes/My Note.md',
			description: 'Path to the note',
		},
		{
			name: 'targetPath',
			label: 'Target Note Path (for create)',
			type: 'string',
			default: '',
			placeholder: 'e.g., Notes/Target.md',
			description: 'Note to link to (for create operation)',
		},
		{
			name: 'linkText',
			label: 'Link Text (optional)',
			type: 'string',
			default: '',
			placeholder: 'e.g., See also',
			description: 'Display text for the link',
		},
	],
	async execute(inputs, config, context: ExecutionContext) {
		const operationValue = typeof config.operation === 'string' ? config.operation : 'getBacklinks';
		const pathTemplate = typeof config.path === 'string' ? config.path : '';
		const targetPathTemplate = typeof config.targetPath === 'string' ? config.targetPath : '';
		const linkTextTemplate = typeof config.linkText === 'string' ? config.linkText : '';

		try {
			const vault = requireVault(context);
			const metadataCache = requireMetadataCache(context);
			const finalPath = String(resolveVariables(pathTemplate, inputs));

			const file = vault.getAbstractFileByPath(finalPath);
			if (!(file instanceof TFile)) {
				throw new Error(`Note not found: ${finalPath ?? 'unknown'}`);
			}

			let result: unknown = {};

			if (operationValue === 'getBacklinks') {
				// Get backlinks using Obsidian API
				const backlinks: string[] = [];

			const backlinksGetter = (metadataCache as { getBacklinksForFile?: (_file: TFile) => { data?: Record<string, unknown> } }).getBacklinksForFile;
			const cache = backlinksGetter ? backlinksGetter(file) : undefined;
				if (cache?.data) {
					for (const sourcePath of Object.keys(cache.data)) {
						backlinks.push(sourcePath);
					}
				}

				result = {
					backlinks,
					count: backlinks.length,
				};
			} else if (operationValue === 'getOutgoing') {
				// Get outgoing links from content
				const content = await vault.read(file);
				const linkRegex = /\[\[([^\]]+)\]\]/g;
				const links: string[] = [];

				let match;
				while ((match = linkRegex.exec(content)) !== null) {
					links.push(match[1]);
				}

				result = {
					outgoingLinks: links,
					count: links.length,
				};
			} else if (operationValue === 'createLink') {
				// Create a link to target note
				const finalTargetPath = String(resolveVariables(targetPathTemplate, inputs));
				const targetFile = vault.getAbstractFileByPath(finalTargetPath);

				if (!(targetFile instanceof TFile)) {
					throw new Error(`Target note not found: ${finalTargetPath ?? 'unknown'}`);
				}

				const targetBasename = targetFile.basename;
				const resolvedLinkText = toStringSafe(resolveVariables(linkTextTemplate, inputs), '');
				const linkDisplay = resolvedLinkText ? `${resolvedLinkText ?? 'unknown'}|${targetBasename}` : targetBasename;
				const link = `[[${linkDisplay}]]`;

				// Append link to source note
				const content = await vault.read(file);
				const newContent = content + `\n\n${link}`;
				await vault.modify(file, newContent);

				result = {
					link,
					source: finalPath,
					target: finalTargetPath,
					created: true,
				};
			}

			return [{
				json: {
					path: finalPath,
					operation: operationValue,
					...toRecord(result),
				}
			}];
		} catch (error) {
			throw new Error(`Manage links failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Regex Node - Regular expression operations
 */
const regexNode: NodeDef = {
	type: 'regex',
	name: 'Regex',
	icon: '🔤',
	color: '#8b5cf6',
	description: 'Regular expression operations',
	category: 'data',
	parameters: [
		{
			name: 'operation',
			label: 'Operation',
			type: 'select',
			default: 'match',
			options: [
				{ label: 'Match', value: 'match' },
				{ label: 'Match All', value: 'matchAll' },
				{ label: 'Replace', value: 'replace' },
				{ label: 'Test', value: 'test' },
				{ label: 'Split', value: 'split' },
			],
			description: 'Regex operation',
		},
		{
			name: 'field',
			label: 'Field Name',
			type: 'string',
			default: 'text',
			placeholder: 'e.g., content, message',
			description: 'Field containing text',
		},
		{
			name: 'pattern',
			label: 'Regex Pattern',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'e.g., \\d+, [A-Z]\\w+',
			description: 'Regular expression pattern',
		},
		{
			name: 'flags',
			label: 'Flags',
			type: 'string',
			default: 'g',
			placeholder: 'e.g., g, gi, gm',
			description: 'Regex flags (g=global, i=case-insensitive, m=multiline)',
		},
		{
			name: 'replacement',
			label: 'Replacement (for replace)',
			type: 'string',
			default: '',
			description: 'Replacement string',
		},
	],
	execute(inputs, config, _context: ExecutionContext) {
		const operationValue = typeof config.operation === 'string' ? config.operation : 'match';
		const fieldName = typeof config.field === 'string' ? config.field : 'text';
		const patternValue = typeof config.pattern === 'string' ? config.pattern : '';
		const flagsValue = typeof config.flags === 'string' ? config.flags : 'g';
		const replacementValue = typeof config.replacement === 'string' ? config.replacement : '';

		try {
			const input = getInputJson(inputs);
			const sourceValue = input[fieldName];
			const text = typeof sourceValue === 'string' ? sourceValue : toStringSafe(sourceValue, '');
			const regex = new RegExp(patternValue, flagsValue);

			let result: unknown;

			switch (operationValue) {
				case 'match': {
					const match = text.match(regex);
					result = {
						matches: match || [],
						matched: !!match,
						count: match?.length || 0,
					};
					break;
				}
				case 'matchAll': {
					const matches = Array.from(text.matchAll(regex));
					result = {
						matches: matches.map(m => ({
							match: m[0],
							index: m.index,
							groups: m.slice(1),
						})),
						count: matches.length,
					};
					break;
				}
				case 'replace': {
					const replaced = text.replace(regex, replacementValue);
					result = {
						result: replaced,
						original: text,
						changed: replaced !== text,
					};
					break;
				}
				case 'test': {
					result = {
						matched: regex.test(text),
						pattern: patternValue,
					};
					break;
				}
				case 'split': {
					const parts = text.split(regex);
					result = {
						parts,
						count: parts.length,
					};
					break;
				}
			}

			return [{
				json: {
					operation: operationValue,
					pattern: patternValue,
					...toRecord(result),
				}
			}];
		} catch (error) {
			throw new Error(`Regex operation failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Array Operations Node - Array manipulation
 */
const arrayOpsNode: NodeDef = {
	type: 'arrayOps',
	name: 'Array Operations',
	icon: '📚',
	color: '#8b5cf6',
	description: 'Array manipulation operations',
	category: 'data',
	parameters: [
		{
			name: 'operation',
			label: 'Operation',
			type: 'select',
			default: 'length',
			options: [
				{ label: 'Length', value: 'length' },
				{ label: 'Join', value: 'join' },
				{ label: 'Reverse', value: 'reverse' },
				{ label: 'Sort', value: 'sort' },
				{ label: 'Unique', value: 'unique' },
				{ label: 'First', value: 'first' },
				{ label: 'Last', value: 'last' },
				{ label: 'Slice', value: 'slice' },
				{ label: 'Concat', value: 'concat' },
				{ label: 'Flatten', value: 'flatten' },
			],
			description: 'Array operation',
		},
		{
			name: 'field',
			label: 'Array Field',
			type: 'string',
			default: 'items',
			placeholder: 'e.g., results, data',
			description: 'Field containing array',
		},
		{
			name: 'separator',
			label: 'Separator (for join)',
			type: 'string',
			default: ', ',
			description: 'String to join array elements',
		},
		{
			name: 'start',
			label: 'Start Index (for slice)',
			type: 'number',
			default: 0,
			description: 'Starting index',
		},
		{
			name: 'end',
			label: 'End Index (for slice)',
			type: 'number',
			default: 5,
			description: 'Ending index',
		},
		{
			name: 'sortBy',
			label: 'Sort By (for sort)',
			type: 'string',
			default: '',
			placeholder: 'e.g., name, price',
			description: 'Field to sort by (for array of objects)',
		},
	],
	execute(inputs, config, _context: ExecutionContext) {
		const operationValue = typeof config.operation === 'string' ? config.operation : 'length';
		const fieldName = typeof config.field === 'string' ? config.field : 'items';
		const separatorValue = typeof config.separator === 'string' ? config.separator : ', ';
		const startIndex = Math.max(0, toNumberSafe(config.start, 0));
		const endIndexRaw = config.end;
		const endIndex = typeof endIndexRaw === 'number' && Number.isFinite(endIndexRaw)
			? endIndexRaw
			: toNumberSafe(endIndexRaw, startIndex + 5);
		const sortByField = typeof config.sortBy === 'string' ? config.sortBy : '';

		try {
			const input = getInputJson(inputs);
			const arrayValue = input[fieldName];

			if (!Array.isArray(arrayValue)) {
				throw new Error(`Field "${fieldName ?? 'unknown'}" is not an array`);
			}

			const array = arrayValue as unknown[];
			let result: unknown;

			switch (operationValue) {
				case 'length':
					result = array.length;
					break;
				case 'join':
					result = array.join(separatorValue);
					break;
				case 'reverse':
					result = [...array].reverse();
					break;
				case 'sort':
					if (sortByField && array.every(item => isRecord(item))) {
						const sorted = [...array] as Record<string, unknown>[];
						result = sorted.sort((a, b) => {
							const aVal = a[sortByField];
							const bVal = b[sortByField];
							if (typeof aVal === 'number' && typeof bVal === 'number') {
								return aVal - bVal;
							}
							const aStr = toStringSafe(aVal, '');
							const bStr = toStringSafe(bVal, '');
							return aStr.localeCompare(bStr);
						});
					} else {
						result = [...array].sort();
					}
					break;
				case 'unique':
					result = [...new Set(array)];
					break;
				case 'first':
					result = array[0];
					break;
				case 'last':
					result = array[array.length - 1];
					break;
				case 'slice':
					result = array.slice(startIndex, endIndex);
					break;
				case 'concat':
					result = array;
					break;
				case 'flatten':
					result = (array as unknown as unknown[][]).flat();
					break;
				default:
					result = array;
			}

			return [{
				json: {
					result,
					operation: operationValue,
					originalLength: array.length,
					_field: fieldName,
				}
			}];
		} catch (error) {
			throw new Error(`Array operation failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Object Operations Node - Object manipulation
 */
const objectOpsNode: NodeDef = {
	type: 'objectOps',
	name: 'Object Operations',
	icon: '🔷',
	color: '#8b5cf6',
	description: 'Object manipulation operations',
	category: 'data',
	parameters: [
		{
			name: 'operation',
			label: 'Operation',
			type: 'select',
			default: 'keys',
			options: [
				{ label: 'Get Keys', value: 'keys' },
				{ label: 'Get Values', value: 'values' },
				{ label: 'Get Entries', value: 'entries' },
				{ label: 'Pick Fields', value: 'pick' },
				{ label: 'Omit Fields', value: 'omit' },
				{ label: 'Merge Objects', value: 'merge' },
				{ label: 'Has Key', value: 'hasKey' },
				{ label: 'Get Nested', value: 'getNested' },
			],
			description: 'Object operation',
		},
		{
			name: 'fields',
			label: 'Fields',
			type: 'string',
			default: '',
			placeholder: 'e.g., name, email, age (comma-separated)',
			description: 'Field names (for pick/omit/hasKey operations)',
		},
		{
			name: 'path',
			label: 'Nested Path (for getNested)',
			type: 'string',
			default: '',
			placeholder: 'e.g., user.profile.name',
			description: 'Dot-notation path to nested value',
		},
	],
	execute(inputs, config, _context: ExecutionContext) {
		const operationValue = typeof config.operation === 'string' ? config.operation : 'keys';
		const fieldsValue = typeof config.fields === 'string' ? config.fields : '';
		const nestedPath = typeof config.path === 'string' ? config.path : '';

		try {
			const input = getInputJson(inputs);
			let result: unknown;

			const fieldsList = fieldsValue
				? fieldsValue.split(',').map(field => field.trim()).filter(Boolean)
				: [];

			switch (operationValue) {
				case 'keys':
					result = Object.keys(input);
					break;
				case 'values':
					result = Object.values(input);
					break;
				case 'entries':
					result = Object.entries(input).map(([key, value]) => ({ key, value }));
					break;
				case 'pick': {
					const picked: Record<string, unknown> = {};
					for (const field of fieldsList) {
						if (field in input) {
							picked[field] = input[field];
						}
					}
					result = picked;
					break;
				}
				case 'omit': {
					const omitted = { ...input };
					for (const field of fieldsList) {
						delete omitted[field];
					}
					result = omitted;
					break;
				}
				case 'merge': {
					// Merge all inputs
					const merged: Record<string, unknown> = {};
					for (const inp of inputs) {
						Object.assign(merged, inp.json);
					}
					result = merged;
					break;
				}
				case 'hasKey': {
					const checks: Record<string, boolean> = {};
					for (const field of fieldsList) {
						checks[field] = field in input;
					}
					result = checks;
					break;
				}
				case 'getNested': {
					const parts = nestedPath.split('.').filter(Boolean);
					let current: unknown = input;
					for (const part of parts) {
						if (isRecord(current)) {
							current = current[part];
						} else {
							current = undefined;
							break;
						}
					}
					result = current;
					break;
				}
				default:
					result = input;
			}

			return [{
				json: {
					result,
					operation: operationValue,
					_fields: fieldsList,
				}
			}];
		} catch (error) {
			throw new Error(`Object operation failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Code Node - Execute custom JavaScript code
 */
const codeNode: NodeDef = {
	type: 'code',
	name: 'Code',
	icon: '💻',
	color: '#8b5cf6',
	description: 'Execute custom JavaScript code',
	category: 'data',
	parameters: [
		{
			name: 'code',
			label: 'JavaScript Code',
			type: 'code',
			default: '// Access input data via "input" variable\n// Return result\nreturn { result: input };',
			required: true,
			description: 'JavaScript code to execute. Available: input (current item), inputs (all items), context',
		},
	],
	async execute(inputs, config, context: ExecutionContext) {
		const { code } = config;

		try {
			const { SecureCodeExecutionService } = await import('../services/secure-execution');
			const secureExecutor = SecureCodeExecutionService.getInstance();

			const results: NodeData[] = [];
			for (const inputData of inputs) {
				const executionResult = await secureExecutor.executeCode(
					code,
					{ input: inputData.json, inputs, context },
					context.services,
					{
						timeout: 10000,
						builtinModules: [],
						allowAsync: true,
					}
				);

				results.push({ json: toRecord(executionResult.result || {}) });
			}

			return results;
		} catch (error) {
			throw new Error(`Code execution failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Notification Node - Show system notification
 */
const notificationNode: NodeDef = {
	type: 'notification',
	name: 'Notification',
	icon: '🔔',
	color: '#8b5cf6',
	description: 'Show system notification',
	category: 'tools',
	parameters: [
		{
			name: 'message',
			label: 'Message',
			type: 'textarea',
			default: '',
			required: true,
			placeholder: 'Enter notification message...',
			description: 'Notification message. Use {{fieldName}} for dynamic content',
		},
		{
			name: 'title',
			label: 'Title (optional)',
			type: 'string',
			default: 'Workflow Notification',
			placeholder: 'Notification title',
			description: 'Notification title',
		},
		{
			name: 'duration',
			label: 'Duration (ms)',
			type: 'number',
			default: 5000,
			description: 'How long to show notification (milliseconds)',
		},
	],
	execute(inputs, config, _context: ExecutionContext) {
		const messageTemplate = typeof config.message === 'string' ? config.message : '';
		const titleTemplate = typeof config.title === 'string' ? config.title : 'Workflow Notification';
		const durationValue = Math.max(0, toNumberSafe(config.duration, 5000));

		try {
			const finalMessage = resolveVariables(messageTemplate, inputs);
			const finalTitle = resolveVariables(titleTemplate, inputs);

			// Use Obsidian Notice API
			new Notice(`${finalTitle}\n${finalMessage}`);

			return Promise.resolve([{
				json: {
					message: finalMessage,
					title: finalTitle,
					shown: true,
					timestamp: Date.now(),
					durationMs: durationValue
				}
			}]);
		} catch (error) {
			throw new Error(`Notification failed: ${getErrorMessage(error)}`);
		}
	},
};

// ============================================================================
// OBSIDIAN FILE OPERATIONS
// ============================================================================

/**
 * Get Metadata Node
 * Retrieves metadata from a note
 */
const getMetadataNode: NodeDef = {
	type: 'getMetadata',
	name: 'Get Metadata',
	icon: '📋',
	color: '#8b5cf6',
	description: 'Get metadata from a note (frontmatter, tags, links, etc.)',
	category: 'tools',
	parameters: [
		{
			name: 'path',
			label: 'Note Path',
			type: 'string',
			required: true,
			default: '',
			description: 'Path to the note (e.g., "folder/note.md")',
		},
	],
	execute(inputs, config, context: ExecutionContext) {
		const pathTemplate = typeof config.path === 'string' ? config.path : '';
		const vault = requireVault(context);
		const metadataCache = requireMetadataCache(context);

		try {
			const finalPath = String(resolveVariables(pathTemplate, inputs));
			const file = vault.getAbstractFileByPath(finalPath);

			if (!(file instanceof TFile)) {
				throw new Error(`File not found: ${finalPath ?? 'unknown'}`);
			}

			const metadata = metadataCache.getFileCache(file);
			const stat = file.stat;
			const tags = Array.isArray(metadata?.tags) ? metadata.tags.map(tag => tag.tag) : [];
			const links = Array.isArray(metadata?.links) ? metadata.links.map(link => link.link) : [];
			const headings = Array.isArray(metadata?.headings)
				? metadata.headings.map(heading => ({ level: heading.level, heading: heading.heading }))
				: [];

			return [{
				json: {
					path: file.path,
					name: file.basename,
					extension: file.extension,
					size: stat.size,
					created: stat.ctime,
					modified: stat.mtime,
					frontmatter: metadata?.frontmatter || {},
					tags,
					links,
					headings,
				}
			}];
		} catch (error) {
			throw new Error(`Get metadata failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * List Files Node
 * Lists files in a folder
 */
const listFilesNode: NodeDef = {
	type: 'listFiles',
	name: 'List Files',
	icon: '📂',
	color: '#8b5cf6',
	description: 'List files in a folder with optional filtering',
	category: 'tools',
	parameters: [
		{
			name: 'folder',
			label: 'Folder Path',
			type: 'string',
			default: '',
			description: 'Folder path (empty for root)',
		},
		{
			name: 'recursive',
			label: 'Recursive',
			type: 'boolean',
			default: false,
			description: 'Include subfolders',
		},
		{
			name: 'extension',
			label: 'File Extension Filter',
			type: 'string',
			default: 'md',
			description: 'Filter by extension (e.g., "md", "pdf")',
		},
	],
	execute(inputs, config, context: ExecutionContext) {
		const folderTemplate = typeof config.folder === 'string' ? config.folder : '';
		const recursiveValue = toBooleanSafe(config.recursive, false);
		const extensionFilter = typeof config.extension === 'string' ? config.extension : '';
		const vault = requireVault(context);

		try {
			const finalFolder = String(resolveVariables(folderTemplate, inputs));
			const normalizedFolder = finalFolder.trim();
			const targetFolder = normalizedFolder.endsWith('/')
				? normalizedFolder.slice(0, -1)
				: normalizedFolder;
			const normalizedExtension = extensionFilter.replace(/^\./, '').toLowerCase();
			const allFiles = vault.getFiles();

			const filteredFiles = allFiles.filter(file => {
				// Extension filter
				if (normalizedExtension && !file.path.toLowerCase().endsWith(`.${normalizedExtension}`)) {
					return false;
				}

				// Folder filter
				if (targetFolder) {
					if (recursiveValue) {
						return file.path.startsWith(`${targetFolder}/`);
					}
					return file.parent?.path === targetFolder;
				}

				return true;
			});

			const fileList = filteredFiles.map(file => ({
				path: file.path,
				name: file.basename,
				extension: file.extension,
				size: file.stat.size,
				created: file.stat.ctime,
				modified: file.stat.mtime,
			}));

			return [{
				json: {
					files: fileList,
					count: fileList.length,
				}
			}];
		} catch (error) {
			throw new Error(`List files failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Move/Rename Note Node
 */
const moveRenameNoteNode: NodeDef = {
	type: 'moveRenameNote',
	name: 'Move/Rename Note',
	icon: '📦',
	color: '#8b5cf6',
	description: 'Move or rename a note',
	category: 'tools',
	parameters: [
		{
			name: 'sourcePath',
			label: 'Source Path',
			type: 'string',
			required: true,
			default: '',
			description: 'Current path of the note',
		},
		{
			name: 'targetPath',
			label: 'Target Path',
			type: 'string',
			required: true,
			default: '',
			description: 'New path for the note',
		},
	],
	async execute(inputs, config, context: ExecutionContext) {
		const sourceTemplate = typeof config.sourcePath === 'string' ? config.sourcePath : '';
		const targetTemplate = typeof config.targetPath === 'string' ? config.targetPath : '';
		const vault = requireVault(context);

		try {
			const finalSourcePath = String(resolveVariables(sourceTemplate, inputs));
			const finalTargetPath = String(resolveVariables(targetTemplate, inputs));

			const file = vault.getAbstractFileByPath(finalSourcePath);
			if (!file) {
				throw new Error(`File not found: ${finalSourcePath ?? 'unknown'}`);
			}

			await vault.rename(file, finalTargetPath);

			return [{
				json: {
					oldPath: finalSourcePath,
					newPath: finalTargetPath,
					success: true,
				}
			}];
		} catch (error) {
			throw new Error(`Move/rename failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Delete Note Node
 */
const deleteNoteNode: NodeDef = {
	type: 'deleteNote',
	name: 'Delete Note',
	icon: '🗑️',
	color: '#ef4444',
	description: 'Delete a note (use with caution!)',
	category: 'tools',
	parameters: [
		{
			name: 'path',
			label: 'Note Path',
			type: 'string',
			required: true,
			default: '',
			description: 'Path to the note to delete',
		},
		{
			name: 'confirm',
			label: 'Confirm Deletion',
			type: 'boolean',
			default: false,
			description: 'Must be true to delete',
		},
	],
	async execute(inputs, config, context: ExecutionContext) {
		const pathTemplate = typeof config.path === 'string' ? config.path : '';
		const confirmDeletion = toBooleanSafe(config.confirm, false);
		const vault = requireVault(context);

		if (!confirmDeletion) {
			throw new Error('Deletion not confirmed. Set "confirm" to true.');
		}

		try {
			const finalPath = String(resolveVariables(pathTemplate, inputs));
			const file = vault.getAbstractFileByPath(finalPath);

			if (!(file instanceof TFile)) {
				throw new Error(`File not found: ${finalPath ?? 'unknown'}`);
			}

			const app = context.services.app;
			if (!app?.fileManager?.trashFile) {
				throw new Error('Obsidian file manager is not available');
			}
			await app.fileManager.trashFile(file);

			return [{
				json: {
					path: finalPath,
					deleted: true,
					timestamp: Date.now(),
				}
			}];
		} catch (error) {
			throw new Error(`Delete failed: ${getErrorMessage(error)}`);
		}
	},
};

// ============================================================================
// TRIGGERS (Placeholder - require runtime support)
// ============================================================================

/**
 * Schedule Node
 * Triggers workflow on a schedule
 */
const scheduleNode: NodeDef = {
	type: 'schedule',
	name: 'Schedule',
	icon: '⏰',
	color: '#f59e0b',
	description: 'Trigger workflow on a schedule (cron expression)',
	category: 'trigger',
	parameters: [
		{
			name: 'cron',
			label: 'Cron Expression',
			type: 'string',
			default: '0 */1 * * *',
			description: 'Cron expression (e.g., "0 */1 * * *" for every hour)',
		},
		{
			name: 'enabled',
			label: 'Enabled',
			type: 'boolean',
			default: true,
		},
	],
	execute(_inputs, config, _context: ExecutionContext) {
		// Note: Actual scheduling would require integration with plugin's scheduler
		const cronExpression = typeof config.cron === 'string' ? config.cron : '';
		const enabled = toBooleanSafe(config.enabled, true);
		return Promise.resolve([{
			json: {
				message: 'Schedule trigger configured',
				cron: cronExpression,
				enabled,
				timestamp: Date.now(),
			}
		}]);
	},
};

/**
 * File Watcher Node
 */
const fileWatcherNode: NodeDef = {
	type: 'fileWatcher',
	name: 'File Watcher',
	icon: '👁️',
	color: '#f59e0b',
	description: 'Trigger workflow when files change',
	category: 'trigger',
	parameters: [
		{
			name: 'folder',
			label: 'Watch Folder',
			type: 'string',
			default: '',
			description: 'Folder to watch (empty for all)',
		},
		{
			name: 'eventType',
			label: 'Event Type',
			type: 'select',
			options: [{ label: 'create', value: 'create' }, { label: 'modify', value: 'modify' }, { label: 'delete', value: 'delete' }, { label: 'rename', value: 'rename' }],
			default: 'modify',
		},
	],
	execute(_inputs, config, _context: ExecutionContext) {
		// Note: Actual file watching would require plugin integration
		const folderPath = typeof config.folder === 'string' ? config.folder : '';
		const eventType = typeof config.eventType === 'string' ? config.eventType : 'modify';
		return Promise.resolve([{
			json: {
				message: 'File watcher configured',
				folder: folderPath,
				eventType,
				timestamp: Date.now(),
			}
		}]);
	},
};

/**
 * Webhook Node
 */
const webhookNode: NodeDef = {
	type: 'webhook',
	name: 'Webhook',
	icon: '🔗',
	color: '#f59e0b',
	description: 'Trigger workflow via HTTP webhook',
	category: 'trigger',
	parameters: [
		{
			name: 'path',
			label: 'Webhook Path',
			type: 'string',
			default: '/webhook',
			description: 'URL path for webhook',
		},
		{
			name: 'method',
			label: 'HTTP Method',
			type: 'select',
			options: [{ label: 'GET', value: 'GET' }, { label: 'POST', value: 'POST' }, { label: 'PUT', value: 'PUT' }, { label: 'DELETE', value: 'DELETE' }],
			default: 'POST',
		},
	],
	execute(_inputs, config, _context: ExecutionContext) {
		// Note: Actual webhook would require HTTP server integration
		const webhookPath = typeof config.path === 'string' ? config.path : '/webhook';
		const method = typeof config.method === 'string' ? config.method : 'POST';
		return Promise.resolve([{
			json: {
				message: 'Webhook configured',
				path: webhookPath,
				method,
				timestamp: Date.now(),
			}
		}]);
	},
};

// ============================================================================
// DATA FORMAT PROCESSING
// ============================================================================

/**
 * CSV Parser Node
 */
const csvParserNode: NodeDef = {
	type: 'csvParser',
	name: 'CSV Parser',
	icon: '📊',
	color: '#06b6d4',
	description: 'Parse CSV text into array of objects',
	category: 'data',
	parameters: [
		{
			name: 'csvData',
			label: 'CSV Data',
			type: 'string',
			required: true,
			default: '',
			description: 'CSV text to parse',
		},
		{
			name: 'delimiter',
			label: 'Delimiter',
			type: 'string',
			default: ',',
			description: 'Column delimiter',
		},
		{
			name: 'hasHeader',
			label: 'Has Header Row',
			type: 'boolean',
			default: true,
		},
	],
	execute(inputs, config, _context: ExecutionContext) {
		const csvTemplate = typeof config.csvData === 'string' ? config.csvData : '';
		const delimiterValue = typeof config.delimiter === 'string' && config.delimiter.trim() !== ''
			? config.delimiter
			: ',';
		const hasHeaderValue = toBooleanSafe(config.hasHeader, true);

		try {
			const data = toStringSafe(resolveVariables(csvTemplate, inputs), '');
			const lines = data.split('\n').filter(line => line.trim().length > 0);

			if (lines.length === 0) {
				return [{ json: { rows: [], count: 0 } }];
			}

			const headers = hasHeaderValue
				? lines[0].split(delimiterValue).map(header => header.trim())
				: lines[0].split(delimiterValue).map((_, index) => `col${index + 1}`);

			const startIndex = hasHeaderValue ? 1 : 0;
			const rows = lines.slice(startIndex).map(line => {
				const values = line.split(delimiterValue).map(value => value.trim());
				const obj: Record<string, string> = {};
				headers.forEach((header, index) => {
					obj[header] = values[index] ?? '';
				});
				return obj;
			});

			return [{
				json: {
					rows,
					count: rows.length,
					headers,
				}
			}];
		} catch (error) {
			throw new Error(`CSV parse failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * CSV Builder Node
 */
const csvBuilderNode: NodeDef = {
	type: 'csvBuilder',
	name: 'CSV Builder',
	icon: '📈',
	color: '#06b6d4',
	description: 'Build CSV text from array of objects',
	category: 'data',
	parameters: [
		{
			name: 'dataArray',
			label: 'Data Array',
			type: 'string',
			required: true,
			default: '',
			description: 'Array of objects to convert (use {{arrayField}})',
		},
		{
			name: 'delimiter',
			label: 'Delimiter',
			type: 'string',
			default: ',',
		},
		{
			name: 'includeHeader',
			label: 'Include Header',
			type: 'boolean',
			default: true,
		},
	],
	execute(inputs, config, _context: ExecutionContext) {
		const dataTemplate = typeof config.dataArray === 'string' ? config.dataArray : '';
		const delimiterValue = typeof config.delimiter === 'string' && config.delimiter !== '' ? config.delimiter : ',';
		const includeHeaderValue = toBooleanSafe(config.includeHeader, true);

		try {
			const data = resolveVariables(dataTemplate, inputs);
			const parsed = (typeof data === 'string' ? JSON.parse(data) : data) as unknown;

			if (!Array.isArray(parsed) || parsed.length === 0) {
				return [{ json: { csv: '', rows: 0 } }];
			}

			const rowsArray = parsed as unknown[];
			const headers = Array.from(
				rowsArray.reduce<Set<string>>((set, item) => {
					if (isRecord(item)) {
						for (const key of Object.keys(item)) {
							set.add(key);
						}
					}
					return set;
				}, new Set<string>())
			);

			if (headers.length === 0) {
				return [{ json: { csv: '', rows: 0 } }];
			}

			const lines: string[] = [];

			if (includeHeaderValue) {
				lines.push(headers.join(delimiterValue));
			}

			rowsArray.forEach(item => {
				const record = isRecord(item) ? item : {};
				const values = headers.map(header => {
					const value = record[header];
					const textValue = typeof value === 'string' ? value : toStringSafe(value, '');
					return textValue.includes(delimiterValue)
						? `"${textValue.replace(/"/g, '""')}"`
						: textValue;
				});
				lines.push(values.join(delimiterValue));
			});

			return [{
				json: {
					csv: lines.join('\n'),
					rows: rowsArray.length,
					columns: headers.length,
				}
			}];
		} catch (error) {
			throw new Error(`CSV build failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Markdown Parser Node
 */
const markdownParserNode: NodeDef = {
	type: 'markdownParser',
	name: 'Markdown Parser',
	icon: '📝',
	color: '#06b6d4',
	description: 'Parse markdown into structured data',
	category: 'data',
	parameters: [
		{
			name: 'markdown',
			label: 'Markdown Text',
			type: 'string',
			required: true,
			default: '',
			description: 'Markdown to parse',
		},
	],
	execute(inputs, config, _context: ExecutionContext) {
		const markdownTemplate = typeof config.markdown === 'string' ? config.markdown : '';

		try {
			const text = toStringSafe(resolveVariables(markdownTemplate, inputs), '');

			// Extract headings
			const headings: Array<{ level: number; text: string }> = [];
			const headingRegex = /^(#{1,6})\s+(.+)$/gm;
			let match;
			while ((match = headingRegex.exec(text)) !== null) {
				headings.push({
					level: match[1].length,
					text: match[2].trim(),
				});
			}

			// Extract links
			const links: Array<{ text: string; url: string }> = [];
			const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
			while ((match = linkRegex.exec(text)) !== null) {
				links.push({
					text: match[1],
					url: match[2],
				});
			}

			// Extract code blocks
			const codeBlocks: Array<{ language: string; code: string }> = [];
			const codeRegex = /```(\w*)\n([\s\S]*?)```/g;
			while ((match = codeRegex.exec(text)) !== null) {
				codeBlocks.push({
					language: match[1] || 'text',
					code: match[2].trim(),
				});
			}

			return [{
				json: {
					headings,
					links,
					codeBlocks,
					text,
				}
			}];
		} catch (error) {
			throw new Error(`Markdown parse failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Template Node
 */
const templateNode: NodeDef = {
	type: 'template',
	name: 'Template',
	icon: '🎨',
	color: '#06b6d4',
	description: 'Render template with data',
	category: 'data',
	parameters: [
		{
			name: 'template',
			label: 'Template',
			type: 'string',
			required: true,
			default: '',
			description: 'Template string with {{placeholders}}',
		},
	],
	execute(inputs, config, _context: ExecutionContext) {
		const templateValue = typeof config.template === 'string' ? config.template : '';

		try {
			const inputData = getInputJson(inputs);
			let result = templateValue;

			// Simple template replacement
			const placeholderRegex = /\{\{([^}]+)\}\}/g;
			result = result.replace(placeholderRegex, (placeholderMatch: string, key: string) => {
				const trimmedKey = key.trim();
				const value = trimmedKey.includes('.')
					? getValueByPath(inputData, trimmedKey)
					: inputData[trimmedKey];
				if (value === undefined) {
					return placeholderMatch;
				}
				return typeof value === 'string' ? value : toStringSafe(value, placeholderMatch);
			});

			return [{
				json: {
					result,
					template: templateValue,
				}
			}];
		} catch (error) {
			throw new Error(`Template render failed: ${getErrorMessage(error)}`);
		}
	},
};

// ============================================================================
// AI ENHANCEMENT
// ============================================================================

/**
 * Embedding Node
 */
const embeddingNode: NodeDef = {
	type: 'embedding',
	name: 'Embedding',
	icon: '🧬',
	color: '#a855f7',
	description: 'Generate text embeddings using AI',
	category: 'ai',
	parameters: [
		{
			name: 'text',
			label: 'Text',
			type: 'string',
			required: true,
			default: '',
			description: 'Text to generate embeddings for',
		},
		{
			name: 'model',
			label: 'Model',
			type: 'string',
			default: 'text-embedding-ada-002',
			description: 'Embedding model to use',
		},
	],
	async execute(inputs, config, context: ExecutionContext) {
		const textTemplate = typeof config.text === 'string' ? config.text : '';
		const modelValue = typeof config.model === 'string' ? config.model : 'text-embedding-ada-002';

		try {
			const finalText = toStringSafe(resolveVariables(textTemplate, inputs), '');

			const aiService = requireAIService(context);
			const embedding = await aiService.embed?.(finalText);
			if (!embedding || !Array.isArray(embedding)) {
				throw new Error('Embedding service returned undefined or invalid result');
			}

			return [{
				json: {
					text: finalText,
					embedding,
					model: modelValue,
					dimensions: embedding.length,
				}
			}];
		} catch (error) {
			throw new Error(`Embedding failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Vector Search Node
 */
const vectorSearchNode: NodeDef = {
	type: 'vectorSearch',
	name: 'Vector Search',
	icon: '🔍',
	color: '#a855f7',
	description: 'Search using vector similarity',
	category: 'ai',
	parameters: [
		{
			name: 'query',
			label: 'Query Text',
			type: 'string',
			required: true,
			default: '',
			description: 'Search query',
		},
		{
			name: 'limit',
			label: 'Result Limit',
			type: 'number',
			default: 10,
			description: 'Maximum number of results',
		},
	],
	execute(inputs, config, _context: ExecutionContext) {
		const queryTemplate = typeof config.query === 'string' ? config.query : '';
		const limitValue = Math.max(1, toNumberSafe(config.limit, 10));

		try {
			const finalQuery = resolveVariables(queryTemplate, inputs);

			// Note: This would require RAG service integration
			// For now, return placeholder
			return Promise.resolve([{
				json: {
					query: finalQuery,
					results: [],
					count: 0,
					message: 'Vector search requires RAG service setup',
					limit: limitValue,
				}
			}]);
		} catch (error) {
			throw new Error(`Vector search failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Summarize Node
 */
const summarizeNode: NodeDef = {
	type: 'summarize',
	name: 'Summarize',
	icon: '📄',
	color: '#a855f7',
	description: 'Generate AI summary of text',
	category: 'ai',
	parameters: [
		{
			name: 'text',
			label: 'Text to Summarize',
			type: 'string',
			required: true,
			default: '',
			description: 'Text to summarize',
		},
		{
			name: 'model',
			label: 'Model',
			type: 'string',
			required: true,
			default: '',
			description: 'AI model to use for summarization',
		},
		{
			name: 'maxLength',
			label: 'Max Length',
			type: 'number',
			default: 200,
			description: 'Maximum summary length in words',
		},
	],
	async execute(inputs, config, context: ExecutionContext) {
		const textTemplate = typeof config.text === 'string' ? config.text : '';
		const modelValue = typeof config.model === 'string' ? config.model : '';
		const maxLengthValue = Math.max(1, toNumberSafe(config.maxLength, 200));

		try {
			const finalText = toStringSafe(resolveVariables(textTemplate, inputs), '');

			const messages = [
				{
					role: 'user',
					content: `Summarize the following text in no more than ${maxLengthValue} words:\n\n${finalText}`,
				},
			];

			const aiService = requireAIService(context);
			const summaryResponse = await aiService.chat(messages, { model: modelValue });
			const summaryText = typeof summaryResponse === 'string'
				? summaryResponse
				: toStringSafe((summaryResponse as Record<string, unknown>).content ?? summaryResponse, '');
			if (!summaryText) {
				throw new Error('Chat service returned undefined or invalid result');
			}

			return [{
				json: {
					summary: summaryText,
					originalLength: finalText.length,
					model: modelValue,
				}
			}];
		} catch (error) {
			throw new Error(`Summarize failed: ${getErrorMessage(error)}`);
		}
	},
};

// ============================================================================
// FLOW CONTROL
// ============================================================================

/**
 * Error Handler Node
 */
const errorHandlerNode: NodeDef = {
	type: 'errorHandler',
	name: 'Error Handler',
	icon: '🛡️',
	color: '#ef4444',
	description: 'Catch and handle errors from previous nodes',
	category: 'logic',
	parameters: [
		{
			name: 'continueOnError',
			label: 'Continue On Error',
			type: 'boolean',
			default: true,
			description: 'Continue workflow even if error occurs',
		},
		{
			name: 'defaultValue',
			label: 'Default Value',
			type: 'string',
			default: '{}',
			description: 'Default value to return on error (JSON)',
		},
	],
	execute(inputs, config, _context: ExecutionContext) {
		const continueOnErrorValue = toBooleanSafe(config.continueOnError, true);
		const defaultValueTemplate = typeof config.defaultValue === 'string' ? config.defaultValue : '{}';

		try {
			const fallback = JSON.parse(defaultValueTemplate) as Record<string, unknown>;
			return inputs.length > 0 ? inputs : [{ json: fallback }];
		} catch (error) {
			if (continueOnErrorValue) {
				let fallback: Record<string, unknown> = {};
				try {
					fallback = JSON.parse(defaultValueTemplate) as Record<string, unknown>;
				} catch {
					fallback = {};
				}
				return [{
					json: {
						error: getErrorMessage(error),
						defaultValue: fallback,
						handled: true,
					}
				}];
			}
			throw new Error(`Error handler failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Retry Node
 */
const retryNode: NodeDef = {
	type: 'retry',
	name: 'Retry',
	icon: '🔄',
	color: '#f59e0b',
	description: 'Retry operation on failure',
	category: 'logic',
	parameters: [
		{
			name: 'maxRetries',
			label: 'Max Retries',
			type: 'number',
			default: 3,
			description: 'Maximum number of retry attempts',
		},
		{
			name: 'retryDelay',
			label: 'Retry Delay (ms)',
			type: 'number',
			default: 1000,
			description: 'Delay between retries in milliseconds',
		},
	],
	execute(inputs, config, _context: ExecutionContext) {
		const maxRetriesValue = Math.max(0, toNumberSafe(config.maxRetries, 3));
		const retryDelayValue = Math.max(0, toNumberSafe(config.retryDelay, 1000));

		return [{
			json: {
				message: 'Retry configured',
				maxRetries: maxRetriesValue,
				retryDelay: retryDelayValue,
				input: getInputJson(inputs),
			}
		}];
	},
};

/**
 * Debounce Node
 */
const debounceNode: NodeDef = {
	type: 'debounce',
	name: 'Debounce',
	icon: '⏱️',
	color: '#f59e0b',
	description: 'Debounce rapid executions',
	category: 'logic',
	parameters: [
		{
			name: 'delay',
			label: 'Delay (ms)',
			type: 'number',
			default: 1000,
			description: 'Debounce delay in milliseconds',
		},
	],
	async execute(inputs, config, _context: ExecutionContext) {
		const delayMs = Math.max(0, toNumberSafe(config.delay, 1000));

		await new Promise(resolve => setTimeout(resolve, delayMs));

		return inputs;
	},
};

/**
 * Throttle Node
 */
const throttleNode: NodeDef = {
	type: 'throttle',
	name: 'Throttle',
	icon: '🚦',
	color: '#f59e0b',
	description: 'Throttle execution rate',
	category: 'logic',
	parameters: [
		{
			name: 'limit',
			label: 'Rate Limit',
			type: 'number',
			default: 10,
			description: 'Maximum executions per interval',
		},
		{
			name: 'interval',
			label: 'Interval (ms)',
			type: 'number',
			default: 1000,
			description: 'Time interval in milliseconds',
		},
	],
	execute(inputs, config, _context: ExecutionContext) {
		const limitValue = Math.max(1, toNumberSafe(config.limit, 10));
		const intervalValue = Math.max(0, toNumberSafe(config.interval, 1000));

		return [{
			json: {
				message: 'Throttle configured',
				limit: limitValue,
				interval: intervalValue,
				input: getInputJson(inputs),
			}
		}];
	},
};

// ============================================================================
// STORAGE & CACHE
// ============================================================================

/**
 * Cache Node
 */
const cacheNode: NodeDef = {
	type: 'cache',
	name: 'Cache',
	icon: '💾',
	color: '#10b981',
	description: 'Cache data in memory or file',
	category: 'tools',
	parameters: [
		{
			name: 'key',
			label: 'Cache Key',
			type: 'string',
			required: true,
			default: '',
			description: 'Key to store/retrieve cache',
		},
		{
			name: 'operation',
			label: 'Operation',
			type: 'select',
			options: [{ label: 'get', value: 'get' }, { label: 'set', value: 'set' }, { label: 'delete', value: 'delete' }],
			default: 'get',
		},
		{
			name: 'value',
			label: 'Value (for set)',
			type: 'string',
			default: '',
			description: 'Value to cache (JSON string)',
		},
		{
			name: 'ttl',
			label: 'TTL (seconds)',
			type: 'number',
			default: 3600,
			description: 'Time to live in seconds',
		},
	],
	execute(inputs, config, context: ExecutionContext) {
		const keyTemplate = typeof config.key === 'string' ? config.key : '';
		const operationValue = typeof config.operation === 'string' ? config.operation : 'get';
		const valueTemplate = typeof config.value === 'string' ? config.value : '';
		const ttlSeconds = Math.max(0, toNumberSafe(config.ttl, 3600));

		try {
			const finalKey = String(resolveVariables(keyTemplate, inputs));
			const runtimeContext = context as ExecutionContext & { _cache?: Map<string, CacheEntry> };
			const cache = runtimeContext._cache ?? (runtimeContext._cache = new Map<string, CacheEntry>());

			switch (operationValue) {
				case 'get': {
					const cached = cache.get(finalKey);
					return [{
						json: {
							key: finalKey,
							value: cached?.value ?? null,
							hit: !!cached,
						}
					}];
				}
				case 'set': {
					const finalValue = resolveVariables(valueTemplate, inputs);
					cache.set(finalKey, {
						value: finalValue,
						timestamp: Date.now(),
						ttl: ttlSeconds * 1000,
					});
					return [{
						json: {
							key: finalKey,
							cached: true,
							ttl: ttlSeconds,
						}
					}];
				}
				case 'delete': {
					cache.delete(finalKey);
					return [{
						json: {
							key: finalKey,
							deleted: true,
						}
					}];
				}
				default:
					return [{ json: { error: 'Unknown operation' } }];
			}
		} catch (error) {
			throw new Error(`Cache operation failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Database Query Node (Placeholder)
 */
const databaseQueryNode: NodeDef = {
	type: 'databaseQuery',
	name: 'Database Query',
	icon: '🗄️',
	color: '#10b981',
	description: 'Execute database query (SQLite)',
	category: 'tools',
	parameters: [
		{
			name: 'query',
			label: 'SQL Query',
			type: 'string',
			required: true,
			default: '',
			description: 'SQL query to execute',
		},
	],
	execute(_inputs, config, _context: ExecutionContext) {
		const queryTemplate = typeof config.query === 'string' ? config.query : '';

		return [{
			json: {
				message: 'Database query not yet implemented',
				query: queryTemplate,
			}
		}];
	},
};

/**
 * Key-Value Store Node
 */
const keyValueStoreNode: NodeDef = {
	type: 'keyValueStore',
	name: 'Key-Value Store',
	icon: '🔑',
	color: '#10b981',
	description: 'Simple key-value storage',
	category: 'tools',
	parameters: [
		{
			name: 'key',
			label: 'Key',
			type: 'string',
			required: true,
			default: '',
		},
		{
			name: 'operation',
			label: 'Operation',
			type: 'select',
			options: [{ label: 'get', value: 'get' }, { label: 'set', value: 'set' }, { label: 'delete', value: 'delete' }, { label: 'list', value: 'list' }],
			default: 'get',
		},
		{
			name: 'value',
			label: 'Value (for set)',
			type: 'string',
			default: '',
		},
	],
	execute(inputs, config, context: ExecutionContext) {
		const keyTemplate = typeof config.key === 'string' ? config.key : '';
		const operationValue = typeof config.operation === 'string' ? config.operation : 'get';
		const valueTemplate = typeof config.value === 'string' ? config.value : '';

		try {
			const finalKey = String(resolveVariables(keyTemplate, inputs));
			const runtimeContext = context as ExecutionContext & { _kvStore?: Map<string, unknown> };
			const store = runtimeContext._kvStore ?? (runtimeContext._kvStore = new Map<string, unknown>());

			switch (operationValue) {
				case 'get':
					return [{
						json: {
							key: finalKey,
							value: store.get(finalKey) || null,
						}
					}];
				case 'set': {
					const finalValue = resolveVariables(valueTemplate, inputs);
					store.set(finalKey, finalValue);
					return [{
						json: {
							key: finalKey,
							value: finalValue,
							stored: true,
						}
					}];
				}
				case 'delete':
					store.delete(finalKey);
					return [{
						json: {
							key: finalKey,
							deleted: true,
						}
					}];
				case 'list':
					return [{
						json: {
							keys: Array.from(store.keys()),
							count: store.size,
						}
					}];
				default:
					return [{ json: { error: 'Unknown operation' } }];
			}
		} catch (error) {
			throw new Error(`Key-value store failed: ${getErrorMessage(error)}`);
		}
	},
};

// ============================================================================
// TEXT PROCESSING
// ============================================================================

/**
 * Text Splitter Node
 */
const textSplitterNode: NodeDef = {
	type: 'textSplitter',
	name: 'Text Splitter',
	icon: '✂️',
	color: '#06b6d4',
	description: 'Split text intelligently by tokens or chunks',
	category: 'data',
	parameters: [
		{
			name: 'text',
			label: 'Text',
			type: 'string',
	required: true,
			default: '',
		},
		{
			name: 'mode',
			label: 'Split Mode',
			type: 'select',
			options: [{ label: 'paragraph', value: 'paragraph' }, { label: 'sentence', value: 'sentence' }, { label: 'fixed', value: 'fixed' }],
			default: 'paragraph',
		},
		{
			name: 'chunkSize',
			label: 'Chunk Size',
			type: 'number',
			default: 1000,
			description: 'Characters per chunk (for fixed mode)',
		},
	],
	execute(inputs, config, _context: ExecutionContext) {
		const textTemplate = typeof config.text === 'string' ? config.text : '';
		const modeValue = typeof config.mode === 'string' ? config.mode : 'paragraph';
		const chunkSizeValue = Math.max(1, toNumberSafe(config.chunkSize, 1000));

		try {
			const finalText = toStringSafe(resolveVariables(textTemplate, inputs), '');
			let chunks: string[] = [];

			switch (modeValue) {
				case 'paragraph':
					chunks = finalText.split(/\n\n+/).map((s: string) => s.trim()).filter(Boolean);
					break;
				case 'sentence':
					chunks = finalText.split(/[.!?]+/).map((s: string) => s.trim()).filter(Boolean);
					break;
				case 'fixed': {
					for (let i = 0; i < finalText.length; i += chunkSizeValue) {
						chunks.push(finalText.substring(i, i + chunkSizeValue));
					}
					break;
				}
			}

			return [{
				json: {
					chunks,
					count: chunks.length,
					mode: modeValue,
				}
			}];
		} catch (error) {
			throw new Error(`Text split failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Word Count Node
 */
const wordCountNode: NodeDef = {
	type: 'wordCount',
	name: 'Word Count',
	icon: '📊',
	color: '#06b6d4',
	description: 'Count words, characters, and lines',
	category: 'data',
	parameters: [
		{
			name: 'text',
			label: 'Text',
			type: 'string',
			required: true,
			default: '',
		},
	],
	execute(inputs, config, _context: ExecutionContext) {
		const textTemplate = typeof config.text === 'string' ? config.text : '';

		try {
			const finalText = toStringSafe(resolveVariables(textTemplate, inputs), '');

			const words = finalText.split(/\s+/).filter(Boolean).length;
			const characters = finalText.length;
			const charactersNoSpaces = finalText.replace(/\s/g, '').length;
			const lines = finalText.split('\n').length;
			const paragraphs = finalText.split(/\n\n+/).filter(Boolean).length;

			return [{
				json: {
					words,
					characters,
					charactersNoSpaces,
					lines,
					paragraphs,
				}
			}];
		} catch (error) {
			throw new Error(`Word count failed: ${getErrorMessage(error)}`);
		}
	},
};

/**
 * Language Detect Node
 */
const languageDetectNode: NodeDef = {
	type: 'languageDetect',
	name: 'Language Detect',
	icon: '🌐',
	color: '#06b6d4',
	description: 'Detect language of text',
	category: 'data',
	parameters: [
		{
			name: 'text',
			label: 'Text',
			type: 'string',
			required: true,
			default: '',
		},
	],
	execute(inputs, config, _context: ExecutionContext) {
		const textTemplate = typeof config.text === 'string' ? config.text : '';

		try {
			const finalText = toStringSafe(resolveVariables(textTemplate, inputs), '');

			// Simple heuristic detection (very basic)
			// In production, would use a proper language detection library
			let language = 'unknown';

			// Check for common patterns
			if (/[\u4e00-\u9fa5]/.test(finalText)) {
				language = 'zh';
			} else if (/[\u3040-\u309F\u30A0-\u30FF]/.test(finalText)) {
				language = 'ja';
			} else if (/[\uAC00-\uD7AF]/.test(finalText)) {
				language = 'ko';
			} else if (/[а-яА-Я]/.test(finalText)) {
				language = 'ru';
			} else if (/[a-zA-Z]/.test(finalText)) {
				language = 'en';
			}

			return [{
				json: {
					language,
					text: finalText.substring(0, 100),
					confidence: 0.8,
				}
			}];
		} catch (error) {
			throw new Error(`Language detect failed: ${getErrorMessage(error)}`);
		}
	},
};

// ============================================================================
// AGENT NODE
// ============================================================================

/**
 * Agent Node
 * Execute an AI Agent with conversation capabilities
 */
const agentNode: NodeDef = {
	type: 'agent',
	name: 'Agent',
	icon: '🤖',
	color: '#a855f7',
	description: 'Execute an AI Agent with full capabilities (tools, RAG, memory, etc.)',
	category: 'ai',
	parameters: [
		{
			name: 'agentId',
			label: 'Agent',
			type: 'select',
			default: '',
			required: true,
			description: 'Select the agent to execute',
			getOptions: async () => {
				// This will be called by the modal to get available agents
				// The modal should have access to plugin settings
				return Promise.resolve([] as Array<{ label: string; value: unknown }>);
			},
		},
		{
			name: 'message',
			label: 'Message',
			type: 'textarea',
			default: '',
			required: true,
			description: 'Message to send to the agent (supports {{variables}})',
		},
		{
			name: 'conversationId',
			label: 'Conversation ID',
			type: 'string',
			default: '',
			description: 'Optional conversation ID for memory (leave empty for new conversation)',
		},
		{
			name: 'systemPromptOverride',
			label: 'System Prompt Override',
			type: 'textarea',
			default: '',
			description: 'Optional system prompt override',
		},
	],
	async execute(inputs, config, context: ExecutionContext) {
		const agentIdValue = typeof config.agentId === 'string' ? config.agentId : '';
		const messageTemplate = typeof config.message === 'string' ? config.message : '';
		const conversationIdTemplate = typeof config.conversationId === 'string' ? config.conversationId : '';
		const systemPromptOverrideTemplate = typeof config.systemPromptOverride === 'string' ? config.systemPromptOverride : '';

		try {
			const finalMessage = resolveVariables(messageTemplate, inputs);
			const finalConversationId = conversationIdTemplate
				? resolveVariables(conversationIdTemplate, inputs)
				: undefined;

			// Get agent configuration from settings
			const settings = context.services.settings;
			if (!settings) {
				throw new Error('Plugin settings are unavailable');
			}

			// Check if agents array exists and has items
			if (!settings.agents || settings.agents.length === 0) {
				throw new Error('No agents configured. Please create an agent in plugin settings first.');
			}

			if (!agentIdValue) {
				throw new Error('No agent selected. Please select an agent from the dropdown.');
			}

			const agent = settings.agents?.find(agentItem => agentItem.id === agentIdValue);

			if (!agent) {
				throw new Error(`Agent not found: ${String(agentIdValue)}. Please check if the agent still exists in settings.`);
			}

			// Get system prompt
			let systemPrompt = '';
			if (systemPromptOverrideTemplate) {
				systemPrompt = resolveVariables(systemPromptOverrideTemplate, inputs);
			} else if (agent.systemPromptId) {
				const prompt = settings.systemPrompts?.find((p: unknown) => (p as { id?: string }).id === agent.systemPromptId);
				if (prompt) {
					systemPrompt = (prompt as { content?: string }).content ?? '';
				}
			}

			// Determine which model to use based on agent strategy
			let modelId: string;
			if (agent.modelStrategy.strategy === 'fixed' && agent.modelStrategy.modelId) {
				modelId = agent.modelStrategy.modelId;
			} else if (agent.modelStrategy.strategy === 'default') {
				// Use the default model from settings
				modelId = settings.defaultModel || '';
				if (!modelId) {
					throw new Error('No default model configured');
				}
			} else {
				// chat-view strategy - we'll use default as fallback
				modelId = settings.defaultModel || '';
				if (!modelId) {
					throw new Error('No model configured');
				}
			}

			// Prepare messages array
			const messages: Array<{ role: string; content: string }> = [];

			// Add system prompt if available
			if (systemPrompt) {
				messages.push({
					role: 'system',
					content: systemPrompt,
				});
			}

			// Add user message
			messages.push({
				role: 'user',
				content: finalMessage,
			});

			const aiService = requireAIService(context);
			const response = await aiService.chat(messages, {
				model: modelId,
				temperature: agent.temperature,
				maxTokens: agent.maxTokens,
			});

			const responseText = typeof response === 'string'
				? response
				: toStringSafe((response as Record<string, unknown>).content ?? response, '');
			if (!responseText) {
				throw new Error('Agent chat service returned undefined or invalid result');
			}

			return [{
				json: {
					response: responseText,
					agentId: agentIdValue,
					agentName: agent.name,
					model: modelId,
					conversationId: finalConversationId,
					messageLength: finalMessage.length,
					responseLength: responseText.length,
					timestamp: Date.now(),
				}
			}];
		} catch (error) {
			throw new Error(`Agent execution failed: ${getErrorMessage(error)}`);
		}
	},
};

// ============================================================================
// REGISTER ALL NODES
// ============================================================================

export function registerCoreNodes(): void {
	nodeRegistry.registerAll([
		// Triggers (5 total)
		startNode,
		scheduleNode,
		fileWatcherNode,
		webhookNode,

		// AI (5 total)
		llmChatNode,
		agentNode,
		embeddingNode,
		vectorSearchNode,
		summarizeNode,

		// Data Processing (6 total)
		transformNode,
		filterNode,
		mergeNode,
		splitNode,
		aggregateNode,
		setVariablesNode,

		// Logic (8 total)
		conditionNode,
		loopNode,
		switchNode,
		delayNode,
		errorHandlerNode,
		retryNode,
		debounceNode,
		throttleNode,

		// Data Utilities (9 total)
		jsonParseNode,
		jsonStringifyNode,
		stringNode,
		dateTimeNode,
		mathNode,
		regexNode,
		arrayOpsNode,
		objectOpsNode,
		codeNode,

		// Data Format Processing (4 total)
		csvParserNode,
		csvBuilderNode,
		markdownParserNode,
		templateNode,

		// Text Processing (3 total)
		textSplitterNode,
		wordCountNode,
		languageDetectNode,

		// Tools - Obsidian (11 total)
		readNoteNode,
		createNoteNode,
		updateNoteNode,
		searchNotesNode,
		dailyNoteNode,
		manageTagsNode,
		manageLinksNode,
		getMetadataNode,
		listFilesNode,
		moveRenameNoteNode,
		deleteNoteNode,

		// Tools - Storage (3 total)
		cacheNode,
		databaseQueryNode,
		keyValueStoreNode,

		// Tools - External (2 total)
		httpRequestNode,
		notificationNode,
	]);
}

// Note: Nodes are registered when initializeWorkflowSystem() is called
// This ensures proper initialization order
