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
	const optional = new Set(definition.parameters.filter(parameter => !parameter.required).map(parameter => parameter.name));
	const result = schema.safeParse(Object.fromEntries(Object.entries(args).filter(([name, value]) => value !== null || !optional.has(name))));
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

export function parametersToJsonSchema(parameters: ToolParameter[]): { type: 'object'; properties: Record<string, unknown>; required: string[] } {
	const properties: Record<string, unknown> = {};
	for (const parameter of parameters) {
		properties[parameter.name] = parameter.schema ?? {
			type: parameter.type,
			description: parameter.description,
			...(parameter.enum ? { enum: parameter.enum } : {}),
		};
	}
	return {
		type: 'object',
		properties,
		required: parameters.filter(parameter => parameter.required).map(parameter => parameter.name),
	};
}

export function singleJsonSchemaType(schema: Record<string, unknown>): string | null {
	if (schema.anyOf || schema.oneOf || schema.allOf) {
		return null;
	}
	const types = (Array.isArray(schema.type) ? schema.type as unknown[] : [schema.type]).filter(type => type !== 'null');
	return types.length === 1 && typeof types[0] === 'string' ? types[0] : null;
}

function zodForParameter(parameter: ToolParameter): z.ZodMiniType {
	if (parameter.schema && singleJsonSchemaType(parameter.schema) === null) {
		return z.unknown();
	}
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
