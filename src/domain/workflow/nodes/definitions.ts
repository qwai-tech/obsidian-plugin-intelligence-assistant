/**
 * Workflow System V2 - Node Definitions
 *
 * Core node implementations for workflow system.
 * Includes essential nodes for triggers, AI, data processing, and logic.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */
import { NodeDef, NodeData, ExecutionContext } from '../core/types';
import { nodeRegistry } from './registry';
import { ErrorHandler, SecurityError, ServiceError, ExecutionError } from '../services/error-handler';
import { resolveVariables } from '../core/variable-resolver';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all available models with provider information
 */
async function getAvailableModelsWithProvider(): Promise<{ label: string; value: string }[]> {
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
	async execute(inputs, config, context) {
		try {
			// Parse input JSON
			const data = typeof config.input === 'string'
				? JSON.parse(config.input || '{}')
				: config.input || {};

			return [{ json: data }];
		} catch (error) {
			throw new Error(`Failed to parse input data: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { model, prompt, systemPrompt, temperature } = config;

		// Resolve variables in prompt and system prompt
		const finalPrompt = resolveVariables(prompt, inputs);
		const finalSystemPrompt = resolveVariables(systemPrompt, inputs);

		// Call AI service
		if (!context.services.ai) {
			throw new Error('AI service is not available');
		}

		try {
			const response = await context.services.ai.chat([
				{ role: 'system', content: finalSystemPrompt },
				{ role: 'user', content: finalPrompt },
			], { model, temperature });

			return [{
				json: {
					response,
					model,
					prompt: finalPrompt,
					systemPrompt: finalSystemPrompt,
				}
			}];
		} catch (error) {
			throw new Error(`AI call failed: ${error.message}`);
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
	async execute(inputs, config, context) {
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
				
				results.push({ json: executionResult.result });
			}

			return results;
		} catch (error) {
			throw new Error(`Secure code execution failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { condition } = config;

		try {
			// Import secure execution service
			const { SecureCodeExecutionService } = await import('../services/secure-execution');
			const secureExecutor = SecureCodeExecutionService.getInstance();

			const results = [];
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
					
					if (Boolean(executionResult.result)) {
						results.push(inputs[i]);
					}
				} catch (error) {
					context.log(`Filter condition execution failed: ${error.message}`);
				}
			}

			return results;
		} catch (error) {
			throw new Error(`Secure filter failed: ${error.message}`);
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
	async execute(inputs, config, context) {
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
	async execute(inputs, config, context) {
		const { splitMode, fieldName, delimiter } = config;

		try {
			const input = inputs[0]?.json || {};
			const results: NodeData[] = [];

			if (splitMode === 'array') {
				// Split array field
				const array = input[fieldName];
				if (!Array.isArray(array)) {
					throw new Error(`Field "${fieldName}" is not an array`);
				}

				for (let i = 0; i < array.length; i++) {
					results.push({
						json: {
							item: array[i],
							index: i,
							total: array.length,
						}
					});
				}
			} else {
				// Split text by delimiter
				const text = String(input[fieldName] || '');
				const parts = text.split(delimiter).map(p => p.trim()).filter(p => p);

				for (let i = 0; i < parts.length; i++) {
					results.push({
						json: {
							text: parts[i],
							index: i,
							total: parts.length,
						}
					});
				}
			}

			return results.length > 0 ? results : [{ json: {} }];
		} catch (error) {
			throw new Error(`Split execution failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { operation, fieldName } = config;

		try {
			let result: any;

			switch (operation) {
				case 'count':
					result = inputs.length;
					break;

				case 'sum': {
					const values = inputs.map(i => Number(i.json[fieldName]) || 0);
					result = values.reduce((a, b) => a + b, 0);
					break;
				}

				case 'avg': {
					const values = inputs.map(i => Number(i.json[fieldName]) || 0);
					const sum = values.reduce((a, b) => a + b, 0);
					result = values.length > 0 ? sum / values.length : 0;
					break;
				}

				case 'min': {
					const values = inputs.map(i => Number(i.json[fieldName]) || 0);
					result = values.length > 0 ? Math.min(...values) : 0;
					break;
				}

				case 'max': {
					const values = inputs.map(i => Number(i.json[fieldName]) || 0);
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
			throw new Error(`Aggregate execution failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { variables } = config;

		try {
			// Parse variables
			const varsObj = typeof variables === 'string' ? JSON.parse(variables) : variables;

			// Resolve all variable values
			const resolvedVars: Record<string, any> = {};
			for (const [key, value] of Object.entries(varsObj)) {
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
			throw new Error(`Set variables failed: ${error.message}`);
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
	async execute(inputs, config, context) {
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
					...input,
					conditionResult: Boolean(executionResult.result),
				}
			}];
		} catch (error) {
			throw new Error(`Secure condition evaluation failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { loopMode, itemsField, loopCount } = config;

		try {
			const results: NodeData[] = [];

			if (loopMode === 'items') {
				// Loop over items in specified field
				const input = inputs[0]?.json || {};
				const fieldName = resolveVariables(itemsField, inputs);
				const items = input[fieldName];

				if (!Array.isArray(items)) {
					throw new Error(`Field "${fieldName}" is not an array or does not exist`);
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
			throw new Error(`Loop execution failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { field, cases, defaultOutput } = config;

		try {
			const input = inputs[0]?.json || {};
			const fieldValue = input[field];

			// Parse cases
			const caseArray = typeof cases === 'string' ? JSON.parse(cases) : cases;

			// Find matching case
			const matchedCase = caseArray.find((c: any) => c.value === fieldValue);
			const outputRoute = matchedCase ? matchedCase.output : defaultOutput;

			return [{
				json: {
					...input,
					_route: outputRoute,
					_matched: !!matchedCase,
					_fieldValue: fieldValue,
				}
			}];
		} catch (error) {
			throw new Error(`Switch execution failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { delayTime } = config;

		try {
			const delayMs = (Number(delayTime) || 1) * 1000;

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
			throw new Error(`Delay execution failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { path, content } = config;

		// Resolve variables in path and content
		const finalPath = resolveVariables(path, inputs);
		const finalContent = resolveVariables(content, inputs);

		try {
			// Create note using Obsidian API
			const vault = context.services.vault;
			const file = await vault.create(finalPath, finalContent);

			return [{
				json: {
					path: file.path,
					created: true,
					timestamp: Date.now(),
				}
			}];
		} catch (error) {
			throw new Error(`Note creation failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { path, includeFrontmatter } = config;

		// Resolve variables in path
		const finalPath = resolveVariables(path, inputs);

		try {
			const vault = context.services.vault;

			// Get the file
			const file = vault.getAbstractFileByPath(finalPath);
			if (!file || !(file as any).extension) {
				throw new Error(`Note not found: ${finalPath}`);
			}

			// Read content
			const content = await vault.read(file);

			// Parse frontmatter if requested
			let frontmatter: Record<string, any> = {};
			let bodyContent = content;

			if (includeFrontmatter) {
				const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
				const match = content.match(frontmatterRegex);

				if (match) {
					try {
						// Simple YAML parsing for common cases
						const yamlText = match[1];
						const lines = yamlText.split('\n');
						for (const line of lines) {
							const colonIndex = line.indexOf(':');
							if (colonIndex > 0) {
								const key = line.substring(0, colonIndex).trim();
								let value: any = line.substring(colonIndex + 1).trim();

								// Remove quotes
								if ((value.startsWith('"') && value.endsWith('"')) ||
								    (value.startsWith("'") && value.endsWith("'"))) {
									value = value.slice(1, -1);
								}

								// Parse arrays
								if (value.startsWith('[') && value.endsWith(']')) {
									value = value.slice(1, -1).split(',').map((v: string) => v.trim());
								}

								// Parse numbers
								if (!isNaN(Number(value)) && value !== '') {
									value = Number(value);
								}

								frontmatter[key] = value;
							}
						}
						bodyContent = match[2];
					} catch (error) {
						context.log(`Failed to parse frontmatter: ${error.message}`);
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
					name: (file as any).name,
					basename: (file as any).basename,
					tags,
				}
			}];
		} catch (error) {
			throw new Error(`Failed to read note: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { path, mode, content, separator } = config;

		// Resolve variables
		const finalPath = resolveVariables(path, inputs);
		const finalContent = resolveVariables(content, inputs);
		const finalSeparator = resolveVariables(separator, inputs);

		try {
			const vault = context.services.vault;

			// Get the file
			const file = vault.getAbstractFileByPath(finalPath);
			if (!file || !(file as any).extension) {
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
			throw new Error(`Failed to update note: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { query, searchIn, folder, limit } = config;

		// Resolve variables
		const finalQuery = resolveVariables(query, inputs).toLowerCase();
		const finalFolder = resolveVariables(folder, inputs);

		try {
			const vault = context.services.vault;

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
				if (searchIn === 'all' || searchIn === 'filename') {
					if (file.basename.toLowerCase().includes(finalQuery)) {
						score += 10;
					}
				}

				// Search in content or tags
				if (searchIn === 'all' || searchIn === 'content' || searchIn === 'tags') {
					const content = await vault.read(file);

					if (searchIn === 'tags' || searchIn === 'all') {
						// Check tags
						const tagMatches = content.matchAll(/#[\w/-]+/g);
						const tags = Array.from(tagMatches).map((m: RegExpMatchArray) => m[0]);
						if (tags.some(tag => tag.toLowerCase().includes(finalQuery))) {
							score += 8;
						}
					}

					if (searchIn === 'content' || searchIn === 'all') {
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
			const limitedResults = results.slice(0, limit);

			return [{
				json: {
					results: limitedResults,
					count: limitedResults.length,
					totalMatches: results.length,
					query: finalQuery,
				}
			}];
		} catch (error) {
			throw new Error(`Failed to search notes: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { dateOffset, folder, format, template } = config;

		try {
			const vault = context.services.vault;

			// Calculate target date
			const targetDate = new Date();
			targetDate.setDate(targetDate.getDate() + (dateOffset || 0));

			// Format date for filename
			const year = targetDate.getFullYear();
			const month = String(targetDate.getMonth() + 1).padStart(2, '0');
			const day = String(targetDate.getDate()).padStart(2, '0');

			let dateStr = format || 'YYYY-MM-DD';
			dateStr = dateStr.replace('YYYY', String(year));
			dateStr = dateStr.replace('MM', month);
			dateStr = dateStr.replace('DD', day);

			// Construct path
			const folderPath = folder ? folder.replace(/\/$/, '') + '/' : '';
			const notePath = `${folderPath}${dateStr}.md`;

			// Check if daily note exists
			let file = vault.getAbstractFileByPath(notePath);
			let isNew = false;
			let content = '';

			if (!file) {
				// Create new daily note
				isNew = true;
				const templateContent = template || '# {{date}}\n\n';
				content = templateContent.replace(/\{\{date\}\}/g, dateStr);

				file = await vault.create(notePath, content);
			} else {
				// Read existing content
				content = await vault.read(file);
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
			throw new Error(`Failed to get/create daily note: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { url, method, body } = config;

		if (!context.services.http) {
			throw new Error('HTTP service is not available');
		}

		try {
			const options: any = { method };

			if (method === 'POST' || method === 'PUT') {
				options.body = typeof body === 'string' ? body : JSON.stringify(body);
				options.headers = { 'Content-Type': 'application/json' };
			}

			const response = await context.services.http.request(url, options);

			return [{
				json: {
					status: response.status,
					data: response.data,
					url,
					method,
				}
			}];
		} catch (error) {
			throw new Error(`HTTP request failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { field } = config;

		try {
			const input = inputs[0]?.json || {};
			const jsonString = input[field];

			if (typeof jsonString !== 'string') {
				throw new Error(`Field "${field}" is not a string`);
			}

			const parsed = JSON.parse(jsonString);

			return [{
				json: {
					...input,
					[field + '_parsed']: parsed,
					_originalField: field,
				}
			}];
		} catch (error) {
			throw new Error(`JSON parse failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { field, pretty } = config;

		try {
			const input = inputs[0]?.json || {};
			const dataToStringify = field ? input[field] : input;

			const jsonString = pretty
				? JSON.stringify(dataToStringify, null, 2)
				: JSON.stringify(dataToStringify);

			return [{
				json: {
					jsonString,
					length: jsonString.length,
					_originalField: field || 'entire input',
				}
			}];
		} catch (error) {
			throw new Error(`JSON stringify failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { operation, field, searchValue, replaceValue, start, length, concatValue } = config;

		try {
			const input = inputs[0]?.json || {};
			let text = String(input[field] || '');
			let result: any;

			switch (operation) {
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
					result = text.replace(new RegExp(searchValue, 'g'), replaceValue);
					break;
				case 'substring':
					result = text.substring(start, start + length);
					break;
				case 'length':
					result = text.length;
					break;
				case 'concat':
					result = text + concatValue;
					break;
				default:
					result = text;
			}

			return [{
				json: {
					result,
					operation,
					originalLength: text.length,
					_field: field,
				}
			}];
		} catch (error) {
			throw new Error(`String operation failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { operation, dateField, format, amount, unit } = config;

		try {
			const input = inputs[0]?.json || {};
			let result: any;

			if (operation === 'now') {
				const now = new Date();
				result = {
					timestamp: now.getTime(),
					iso: now.toISOString(),
					formatted: formatDate(now, format),
				};
			} else if (operation === 'format') {
				const dateValue = input[dateField];
				const date = new Date(dateValue);
				result = formatDate(date, format);
			} else if (operation === 'parse') {
				const dateString = input[dateField];
				const date = new Date(dateString);
				result = {
					timestamp: date.getTime(),
					iso: date.toISOString(),
					valid: !isNaN(date.getTime()),
				};
			} else if (operation === 'math') {
				const dateValue = input[dateField] || new Date();
				const date = new Date(dateValue);

				const multipliers: Record<string, number> = {
					seconds: 1000,
					minutes: 60 * 1000,
					hours: 60 * 60 * 1000,
					days: 24 * 60 * 60 * 1000,
				};

				const offset = amount * (multipliers[unit] || multipliers.days);
				const newDate = new Date(date.getTime() + offset);

				result = {
					timestamp: newDate.getTime(),
					iso: newDate.toISOString(),
					formatted: formatDate(newDate, format),
				};
			}

			return [{
				json: {
					result,
					operation,
					_originalDate: input[dateField],
				}
			}];
		} catch (error) {
			throw new Error(`Date/time operation failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { operation, field1, field2 } = config;

		try {
			// Resolve variable values
			const value1Str = resolveVariables(field1, inputs);
			const value2Str = resolveVariables(field2, inputs);

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
			throw new Error(`Math operation failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { path, operation, tags } = config;

		try {
			const vault = context.services.vault;
			const finalPath = resolveVariables(path, inputs);

			// Get the file
			const file = vault.getAbstractFileByPath(finalPath);
			if (!file || !(file as any).extension) {
				throw new Error(`Note not found: ${finalPath}`);
			}

			// Read content
			let content = await vault.read(file);

			// Parse tags input
			const tagsStr = resolveVariables(tags, inputs);
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
			throw new Error(`Manage tags failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { operation, path, targetPath, linkText } = config;

		try {
			const vault = context.services.vault;
			const app = (context.services as any).app;
			const finalPath = resolveVariables(path, inputs);

			const file = vault.getAbstractFileByPath(finalPath);
			if (!file || !(file as any).extension) {
				throw new Error(`Note not found: ${finalPath}`);
			}

			let result: any = {};

			if (operation === 'getBacklinks') {
				// Get backlinks using Obsidian API
				const backlinks: string[] = [];

				if (app?.metadataCache) {
					const cache = app.metadataCache.getBacklinksForFile?.(file);
					if (cache) {
						const backlinkFiles = cache.data;
						for (const [sourcePath] of Object.entries(backlinkFiles || {})) {
							backlinks.push(sourcePath);
						}
					}
				}

				result = {
					backlinks,
					count: backlinks.length,
				};
			} else if (operation === 'getOutgoing') {
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
			} else if (operation === 'createLink') {
				// Create a link to target note
				const finalTargetPath = resolveVariables(targetPath, inputs);
				const targetFile = vault.getAbstractFileByPath(finalTargetPath);

				if (!targetFile) {
					throw new Error(`Target note not found: ${finalTargetPath}`);
				}

				const targetBasename = (targetFile as any).basename;
				const linkDisplay = linkText ? `${linkText}|${targetBasename}` : targetBasename;
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
					operation,
					...result,
				}
			}];
		} catch (error) {
			throw new Error(`Manage links failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { operation, field, pattern, flags, replacement } = config;

		try {
			const input = inputs[0]?.json || {};
			const text = String(input[field] || '');
			const regex = new RegExp(pattern, flags || '');

			let result: any;

			switch (operation) {
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
					const replaced = text.replace(regex, replacement);
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
						pattern,
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
					operation,
					pattern,
					...result,
				}
			}];
		} catch (error) {
			throw new Error(`Regex operation failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { operation, field, separator, start, end, sortBy } = config;

		try {
			const input = inputs[0]?.json || {};
			const array = input[field];

			if (!Array.isArray(array)) {
				throw new Error(`Field "${field}" is not an array`);
			}

			let result: any;

			switch (operation) {
				case 'length':
					result = array.length;
					break;
				case 'join':
					result = array.join(separator);
					break;
				case 'reverse':
					result = [...array].reverse();
					break;
				case 'sort':
					if (sortBy && array.length > 0 && typeof array[0] === 'object') {
						result = [...array].sort((a, b) => {
							const aVal = a[sortBy];
							const bVal = b[sortBy];
							if (aVal < bVal) return -1;
							if (aVal > bVal) return 1;
							return 0;
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
					result = array.slice(start, end);
					break;
				case 'concat':
					// Concat with another field or array
					result = array;
					break;
				case 'flatten':
					result = array.flat();
					break;
				default:
					result = array;
			}

			return [{
				json: {
					result,
					operation,
					originalLength: array.length,
					_field: field,
				}
			}];
		} catch (error) {
			throw new Error(`Array operation failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { operation, fields, path } = config;

		try {
			const input = inputs[0]?.json || {};
			let result: any;

			const fieldsList = fields ? fields.split(',').map((f: string) => f.trim()) : [];

			switch (operation) {
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
					const picked: Record<string, any> = {};
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
					const merged = {};
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
					const parts = path.split('.');
					let current: any = input;
					for (const part of parts) {
						if (current && typeof current === 'object') {
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
					operation,
					_fields: fieldsList,
				}
			}];
		} catch (error) {
			throw new Error(`Object operation failed: ${error.message}`);
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
	async execute(inputs, config, context) {
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

				results.push({ json: executionResult.result || {} });
			}

			return results;
		} catch (error) {
			throw new Error(`Code execution failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { message, title, duration } = config;

		try {
			const finalMessage = resolveVariables(message, inputs);
			const finalTitle = resolveVariables(title, inputs);

			// Use Obsidian Notice API
			const { Notice } = require('obsidian');
			new Notice(`${finalTitle}\n${finalMessage}`, duration);

			return [{
				json: {
					message: finalMessage,
					title: finalTitle,
					shown: true,
					timestamp: Date.now(),
				}
			}];
		} catch (error) {
			throw new Error(`Notification failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { path } = config;
		const { vault } = context.services;

		try {
			const finalPath = resolveVariables(path, inputs);
			const file = vault.getAbstractFileByPath(finalPath);

			if (!file || !(file instanceof require('obsidian').TFile)) {
				throw new Error(`File not found: ${finalPath}`);
			}

			const metadata = vault.getFileCache(file);
			const stat = file.stat;

			return [{
				json: {
					path: file.path,
					name: file.basename,
					extension: file.extension,
					size: stat.size,
					created: stat.ctime,
					modified: stat.mtime,
					frontmatter: metadata?.frontmatter || {},
					tags: metadata?.tags?.map((t: any) => t.tag) || [],
					links: metadata?.links?.map((l: any) => l.link) || [],
					headings: metadata?.headings?.map((h: any) => ({ level: h.level, heading: h.heading })) || [],
				}
			}];
		} catch (error) {
			throw new Error(`Get metadata failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { folder, recursive, extension } = config;
		const { vault } = context.services;

		try {
			const finalFolder = resolveVariables(folder, inputs);
			const allFiles = vault.getFiles();

			let filteredFiles = allFiles.filter((file: any) => {
				// Extension filter
				if (extension && !file.path.endsWith(`.${extension}`)) {
					return false;
				}

				// Folder filter
				if (finalFolder) {
					if (recursive) {
						return file.path.startsWith(finalFolder);
					} else {
						return file.parent?.path === finalFolder;
					}
				}

				return true;
			});

			const fileList = filteredFiles.map((file: any) => ({
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
			throw new Error(`List files failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { sourcePath, targetPath } = config;
		const { vault } = context.services;

		try {
			const finalSourcePath = resolveVariables(sourcePath, inputs);
			const finalTargetPath = resolveVariables(targetPath, inputs);

			const file = vault.getAbstractFileByPath(finalSourcePath);
			if (!file) {
				throw new Error(`File not found: ${finalSourcePath}`);
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
			throw new Error(`Move/rename failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { path, confirm } = config;
		const { vault } = context.services;

		if (!confirm) {
			throw new Error('Deletion not confirmed. Set "confirm" to true.');
		}

		try {
			const finalPath = resolveVariables(path, inputs);
			const file = vault.getAbstractFileByPath(finalPath);

			if (!file) {
				throw new Error(`File not found: ${finalPath}`);
			}

			await vault.delete(file);

			return [{
				json: {
					path: finalPath,
					deleted: true,
					timestamp: Date.now(),
				}
			}];
		} catch (error) {
			throw new Error(`Delete failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		// Note: Actual scheduling would require integration with plugin's scheduler
		return [{
			json: {
				message: 'Schedule trigger configured',
				cron: config.cron,
				enabled: config.enabled,
				timestamp: Date.now(),
			}
		}];
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
	async execute(inputs, config, context) {
		// Note: Actual file watching would require plugin integration
		return [{
			json: {
				message: 'File watcher configured',
				folder: config.folder,
				eventType: config.eventType,
				timestamp: Date.now(),
			}
		}];
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
	async execute(inputs, config, context) {
		// Note: Actual webhook would require HTTP server integration
		return [{
			json: {
				message: 'Webhook configured',
				path: config.path,
				method: config.method,
				timestamp: Date.now(),
			}
		}];
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
	async execute(inputs, config, context) {
		const { csvData, delimiter, hasHeader } = config;

		try {
			const data = resolveVariables(csvData, inputs);
			const lines = data.split('\n').filter((line: string) => line.trim());

			if (lines.length === 0) {
				return [{ json: { rows: [], count: 0 } }];
			}

			const headers = hasHeader
				? lines[0].split(delimiter).map((h: string) => h.trim())
				: lines[0].split(delimiter).map((_: any, i: number) => `col${i + 1}`);

			const startIndex = hasHeader ? 1 : 0;
			const rows = lines.slice(startIndex).map((line: string) => {
				const values = line.split(delimiter).map((v: string) => v.trim());
				const obj: Record<string, string> = {};
				headers.forEach((header: string, i: number) => {
					obj[header] = values[i] || '';
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
			throw new Error(`CSV parse failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { dataArray, delimiter, includeHeader } = config;

		try {
			const data = resolveVariables(dataArray, inputs);
			const array = typeof data === 'string' ? JSON.parse(data) : data;

			if (!Array.isArray(array) || array.length === 0) {
				return [{ json: { csv: '', rows: 0 } }];
			}

			const headers = Object.keys(array[0]);
			const lines: string[] = [];

			if (includeHeader) {
				lines.push(headers.join(delimiter));
			}

			array.forEach((obj: any) => {
				const values = headers.map(h => String(obj[h] || ''));
				lines.push(values.join(delimiter));
			});

			return [{
				json: {
					csv: lines.join('\n'),
					rows: array.length,
					columns: headers.length,
				}
			}];
		} catch (error) {
			throw new Error(`CSV build failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { markdown } = config;

		try {
			const text = resolveVariables(markdown, inputs);

			// Extract headings
			const headings = [];
			const headingRegex = /^(#{1,6})\s+(.+)$/gm;
			let match;
			while ((match = headingRegex.exec(text)) !== null) {
				headings.push({
					level: match[1].length,
					text: match[2].trim(),
				});
			}

			// Extract links
			const links = [];
			const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
			while ((match = linkRegex.exec(text)) !== null) {
				links.push({
					text: match[1],
					url: match[2],
				});
			}

			// Extract code blocks
			const codeBlocks = [];
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
			throw new Error(`Markdown parse failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { template } = config;

		try {
			const inputData = inputs[0]?.json || {};
			let result = template;

			// Simple template replacement
			const placeholderRegex = /\{\{([^}]+)\}\}/g;
			result = result.replace(placeholderRegex, (match: string, key: string) => {
				const trimmedKey = key.trim();
				if (trimmedKey.includes('.')) {
					// Handle nested paths
					const value = trimmedKey.split('.').reduce((obj: any, k: string) => obj?.[k], inputData);
					return value !== undefined ? String(value) : match;
				}
				return inputData[trimmedKey] !== undefined ? String(inputData[trimmedKey]) : match;
			});

			return [{
				json: {
					result,
					template,
				}
			}];
		} catch (error) {
			throw new Error(`Template render failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { text, model } = config;

		try {
			const finalText = resolveVariables(text, inputs);

			// Call AI embed service
			const embedding = await context.services.ai!.embed(finalText);
			if (!embedding || !Array.isArray(embedding)) {
				throw new Error('Embedding service returned undefined or invalid result');
			}

			return [{
				json: {
					text: finalText,
					embedding,
					model,
					dimensions: embedding.length,
				}
			}];
		} catch (error) {
			throw new Error(`Embedding failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { query, limit } = config;

		try {
			const finalQuery = resolveVariables(query, inputs);

			// Note: This would require RAG service integration
			// For now, return placeholder
			return [{
				json: {
					query: finalQuery,
					results: [],
					count: 0,
					message: 'Vector search requires RAG service setup',
				}
			}];
		} catch (error) {
			throw new Error(`Vector search failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { text, model, maxLength } = config;

		try {
			const finalText = resolveVariables(text, inputs);

			const messages = [
				{
					role: 'user',
					content: `Summarize the following text in no more than ${maxLength} words:\n\n${finalText}`,
				},
			];

			const summary = await context.services.ai!.chat(messages, { model });
			if (!summary || typeof summary !== 'string') {
				throw new Error('Chat service returned undefined or invalid result');
			}

			return [{
				json: {
					summary,
					originalLength: finalText!.length,
					model,
				}
			}];
		} catch (error) {
			throw new Error(`Summarize failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { continueOnError, defaultValue } = config;

		try {
			// Pass through input if no error
			return inputs.length > 0 ? inputs : [{ json: JSON.parse(defaultValue) }];
		} catch (error) {
			if (continueOnError) {
				return [{
					json: {
						error: error.message,
						defaultValue: JSON.parse(defaultValue),
						handled: true,
					}
				}];
			}
			throw error;
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
	async execute(inputs, config, context) {
		const { maxRetries, retryDelay } = config;

		// Note: Actual retry logic would need to be handled at executor level
		return [{
			json: {
				message: 'Retry configured',
				maxRetries,
				retryDelay,
				input: inputs[0]?.json || {},
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
	async execute(inputs, config, context) {
		const { delay } = config;

		// Simple delay implementation
		await new Promise(resolve => setTimeout(resolve, delay));

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
	async execute(inputs, config, context) {
		const { limit, interval } = config;

		// Note: Actual throttling would require state management
		return [{
			json: {
				message: 'Throttle configured',
				limit,
				interval,
				input: inputs[0]?.json || {},
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
	async execute(inputs, config, context) {
		const { key, operation, value, ttl } = config;

		try {
			const finalKey = resolveVariables(key, inputs);

			// Note: Would require cache service implementation
			// For now, use simple in-memory cache
			const cache = (context as any)._cache || ((context as any)._cache = new Map());

			switch (operation) {
				case 'get': {
					const cached = cache.get(finalKey);
					return [{
						json: {
							key: finalKey,
							value: cached?.value || null,
							hit: !!cached,
						}
					}];
				}
				case 'set': {
					const finalValue = resolveVariables(value, inputs);
					cache.set(finalKey, {
						value: finalValue,
						timestamp: Date.now(),
						ttl: ttl * 1000,
					});
					return [{
						json: {
							key: finalKey,
							cached: true,
							ttl,
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
			throw new Error(`Cache operation failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { query } = config;

		// Note: Would require database integration
		return [{
			json: {
				message: 'Database query not yet implemented',
				query,
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
	async execute(inputs, config, context) {
		const { key, operation, value } = config;

		try {
			const finalKey = resolveVariables(key, inputs);
			const store = (context as any)._kvStore || ((context as any)._kvStore = new Map());

			switch (operation) {
				case 'get':
					return [{
						json: {
							key: finalKey,
							value: store.get(finalKey) || null,
						}
					}];
				case 'set': {
					const finalValue = resolveVariables(value, inputs);
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
			throw new Error(`Key-value store failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { text, mode, chunkSize } = config;

		try {
			const finalText = resolveVariables(text, inputs);
			let chunks: string[] = [];

			switch (mode) {
				case 'paragraph':
					chunks = finalText.split(/\n\n+/).map((s: string) => s.trim()).filter(Boolean);
					break;
				case 'sentence':
					chunks = finalText.split(/[.!?]+/).map((s: string) => s.trim()).filter(Boolean);
					break;
				case 'fixed': {
					for (let i = 0; i < finalText.length; i += chunkSize) {
						chunks.push(finalText.substring(i, i + chunkSize));
					}
					break;
				}
			}

			return [{
				json: {
					chunks,
					count: chunks.length,
					mode,
				}
			}];
		} catch (error) {
			throw new Error(`Text split failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { text } = config;

		try {
			const finalText = resolveVariables(text, inputs);

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
			throw new Error(`Word count failed: ${error.message}`);
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
	async execute(inputs, config, context) {
		const { text } = config;

		try {
			const finalText = resolveVariables(text, inputs);

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
			throw new Error(`Language detect failed: ${error.message}`);
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
				return [];
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
	async execute(inputs, config, context) {
		const { agentId, message, conversationId, systemPromptOverride } = config;

		try {
			const finalMessage = resolveVariables(message, inputs);
			const finalConversationId = conversationId ? resolveVariables(conversationId, inputs) : undefined;

			// Get agent configuration from settings
			const settings = context.services.settings;

			// Check if agents array exists and has items
			if (!settings.agents || settings.agents.length === 0) {
				throw new Error('No agents configured. Please create an agent in plugin settings first.');
			}

			// Check if agentId is provided
			if (!agentId) {
				throw new Error('No agent selected. Please select an agent from the dropdown.');
			}

			const agent = settings.agents?.find((a: any) => a.id === agentId);

			if (!agent) {
				throw new Error(`Agent not found: ${agentId}. Please check if the agent still exists in settings.`);
			}

			// Get system prompt
			let systemPrompt = '';
			if (systemPromptOverride) {
				systemPrompt = resolveVariables(systemPromptOverride, inputs);
			} else if (agent.systemPromptId) {
				const prompt = settings.systemPrompts?.find((p: any) => p.id === agent.systemPromptId);
				if (prompt) {
					systemPrompt = prompt.content;
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
			const messages: any[] = [];

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

			// Call AI chat service
			const response = await context.services.ai!.chat(messages, {
				model: modelId,
				temperature: agent.temperature,
				maxTokens: agent.maxTokens,
			});

			if (!response || typeof response !== 'string') {
				throw new Error('Agent chat service returned undefined or invalid result');
			}

			return [{
				json: {
					response,
					agentId,
					agentName: agent.name,
					model: modelId,
					conversationId: finalConversationId,
					messageLength: finalMessage.length,
					responseLength: response.length,
					timestamp: Date.now(),
				}
			}];
		} catch (error) {
			throw new Error(`Agent execution failed: ${error.message}`);
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
