import type { JsonObject, JsonValue } from './agent-engine-core';

export function parseToolArguments(raw: string): JsonObject {
	try {
		const parsed = JSON.parse(raw) as unknown;
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? toJsonObject(parsed) : {};
	} catch {
		return {};
	}
}

export function serializeToolResult(result: unknown): string {
	const serialized = JSON.stringify(result);
	return serialized === undefined ? 'null' : serialized;
}

export function toJsonObject(value: unknown): JsonObject {
	const jsonValue = toJsonValue(value);
	return jsonValue !== null && typeof jsonValue === 'object' && !Array.isArray(jsonValue) ? jsonValue : {};
}

export function toJsonValue(value: unknown): JsonValue {
	if (value === undefined) {
		return null;
	}
	const serialized = JSON.stringify(value);
	if (serialized === undefined) {
		return null;
	}
	return JSON.parse(serialized) as JsonValue;
}
