/**
 * Workflow System V2 - Variable Resolver
 *
 * Provides comprehensive variable resolution for workflow node configurations.
 * Supports template strings like {{data}}, {{input}}, {{field.nested}}, etc.
 */

import { NodeData } from './types';

/**
 * Variable resolution options
 */
export interface VariableResolverOptions {
	/** Allow accessing nested fields with dot notation (e.g., {{user.name}}) */
	allowNestedAccess?: boolean;
	/** Throw error if variable not found (default: false, returns placeholder) */
	throwOnMissing?: boolean;
	/** Custom variable prefix (default: {{) */
	prefix?: string;
	/** Custom variable suffix (default: }}) */
	suffix?: string;
}

/**
 * Resolve variables in a template string
 *
 * Supports:
 * - {{data}} - entire input data as JSON string
 * - {{input}} - alias for {{data}}
 * - {{fieldName}} - specific field from input
 * - {{field.nested.path}} - nested field access with dot notation
 *
 * @param template Template string with variables
 * @param inputs Input data from previous nodes
 * @param options Resolution options
 * @returns Resolved string with variables replaced
 */
export function resolveVariables(
	template: string,
	inputs: NodeData[],
	options: VariableResolverOptions = {}
): string {

	const {
		allowNestedAccess = true,
		throwOnMissing = false,
		prefix = '{{',
		suffix = '}}'
	} = options;

	// Get first input data (most common case)
	const inputData = inputs[0]?.json || {};

	// Create regex pattern to match variables
	const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const escapedSuffix = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const pattern = new RegExp(`${escapedPrefix}\\s*([\\w\\.]+)\\s*${escapedSuffix}`, 'g');

	// Replace all variables
	return template.replace(pattern, (match, variableName: string) => {
		const trimmedVar = variableName.trim();

		// Handle special variables
		if (trimmedVar === 'data' || trimmedVar === 'input') {
			// Return entire input data as JSON string
			return JSON.stringify(inputData);
		}

		// Handle field access
		if (allowNestedAccess && trimmedVar.includes('.')) {
			// Nested field access (e.g., user.name.first)
			const value = getNestedValue(inputData, trimmedVar);
			if (value !== undefined) {
				return formatValue(value);
			}
		} else {
			// Direct field access
			const value = inputData[trimmedVar];
			if (value !== undefined) {
				return formatValue(value);
			}
		}

		// Variable not found
		if (throwOnMissing) {
			throw new Error(`Variable not found: ${trimmedVar}`);
		}

		// Return original placeholder if not found
		return match;
	});
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: unknown, path: string): unknown {
	const parts = path.split('.');
	let current = obj;

	for (const part of parts) {
		if (current == null || typeof current !== 'object') {
			return undefined;
		}
		current = (current as Record<string, unknown>)[part];
	}

	return current;
}

/**
 * Format value for string interpolation
 */
function formatValue(value: unknown): string {
	if (value == null) {
		return '';
	}

	if (typeof value === 'string') {
		return value;
	}

	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}

	// For objects and arrays, return JSON string
	return JSON.stringify(value);
}

/**
 * Extract all variable names from a template string
 *
 * @param template Template string
 * @param options Resolution options
 * @returns Array of variable names found in template
 */
export function extractVariables(
	template: string,
	options: VariableResolverOptions = {}
): string[] {

	const {
		prefix = '{{',
		suffix = '}}'
	} = options;

	const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const escapedSuffix = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const pattern = new RegExp(`${escapedPrefix}\\s*([\\w\\.]+)\\s*${escapedSuffix}`, 'g');

	const variables: string[] = [];
	let match;

	while ((match = pattern.exec(template)) !== null) {
		const variableName = match[1].trim();
		if (!variables.includes(variableName)) {
			variables.push(variableName);
		}
	}

	return variables;
}

/**
 * Check if a template string contains variables
 */
export function hasVariables(
	template: string,
	options: VariableResolverOptions = {}
): boolean {
	return extractVariables(template, options).length > 0;
}

/**
 * Resolve variables in all config values (recursively)
 *
 * @param config Node configuration object
 * @param inputs Input data from previous nodes
 * @param options Resolution options
 * @returns New config object with resolved variables
 */
export function resolveConfigVariables(
	config: Record<string, unknown>,
	inputs: NodeData[],
	options: VariableResolverOptions = {}
): Record<string, unknown> {
	const resolved: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(config)) {
		if (typeof value === 'string') {
			resolved[key] = resolveVariables(value, inputs, options);
		} else if (Array.isArray(value)) {
			resolved[key] = value.map((item: unknown) =>
				typeof item === 'string' ? resolveVariables(item, inputs, options) : item
			);
		} else if (value && typeof value === 'object') {
			resolved[key] = resolveConfigVariables(value as Record<string, unknown>, inputs, options);
		} else {
			resolved[key] = value;
		}
	}

	return resolved;
}
