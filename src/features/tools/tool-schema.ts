import * as z from 'zod/mini';
import './zod-locale';
import type { ToolDefinition, ToolInputSchema, ToolParameter } from '@/features/tools/types/tools';

type CreateToolDefinitionInput = ToolDefinition;

export function createToolDefinition(input: CreateToolDefinitionInput): ToolDefinition {
	return {
		...input,
		inputSchema: input.inputSchema ?? parametersToZodObject(input.parameters),
	};
}

export function validateToolArguments(
	definition: ToolDefinition,
	args: Record<string, unknown>,
): { success: true; data: Record<string, unknown> } | { success: false; error: string } {
	const schema = definition.inputSchema ?? parametersToZodObject(definition.parameters);
	const result = schema.safeParse(args);
	if (!result.success) {
		return {
			success: false,
			error: result.error.issues
				.map(issue => `${issue.path.join('.') || 'root'}: ${issue.message}`)
				.join('; '),
		};
	}
	return { success: true, data: result.data };
}

function parametersToZodObject(parameters: ToolParameter[]): ToolInputSchema {
	const shape: Record<string, z.ZodMiniType> = {};
	for (const parameter of parameters) {
		let field = zodForParameter(parameter);
		if (!parameter.required) {
			field = z.optional(field);
		}
		shape[parameter.name] = field;
	}
	return z.looseObject(shape);
}

function zodForParameter(parameter: ToolParameter): z.ZodMiniType {
	if (parameter.enum?.length) {
		return z.enum(parameter.enum as [string, ...string[]]);
	}
	switch (parameter.type) {
		case 'number':
			return z.number();
		case 'boolean':
			return z.boolean();
		case 'array':
			return z.array(z.unknown());
		case 'object':
			return z.record(z.string(), z.unknown());
		case 'string':
		default:
			return z.string();
	}
}
