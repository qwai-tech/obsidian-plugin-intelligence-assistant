import { z } from 'zod';
import type { ToolDefinition, ToolParameter } from '@/types/common/tools';

interface CreateToolDefinitionInput extends ToolDefinition {}

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
	return { success: true, data: result.data as Record<string, unknown> };
}

export function parametersToZodObject(parameters: ToolParameter[]): z.ZodObject<z.ZodRawShape> {
	const shape: Record<string, z.ZodTypeAny> = {};
	for (const parameter of parameters) {
		let field = zodForParameter(parameter);
		if (!parameter.required) {
			field = field.optional();
		}
		shape[parameter.name] = field;
	}
	return z.object(shape).passthrough();
}

function zodForParameter(parameter: ToolParameter): z.ZodTypeAny {
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
