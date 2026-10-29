export interface ArgumentField {
	name: string;
	type: string;
	required: boolean;
	value: string | boolean;
}

export type ArgumentProblem = 'requiredMissing' | 'invalidNumber' | 'invalidJson';

export type ParsedArguments =
	| { ok: true; args: Record<string, unknown> }
	| { ok: false; problem: ArgumentProblem; name: string };

export function parseToolArguments(fields: ArgumentField[]): ParsedArguments {
	const args: Record<string, unknown> = {};
	for (const field of fields) {
		if (!field.value) {
			if (field.required) return { ok: false, problem: 'requiredMissing', name: field.name };
			continue;
		}
		const parsed = parseValue(field);
		if (!parsed.ok) return { ok: false, problem: parsed.problem, name: field.name };
		args[field.name] = parsed.value;
	}
	return { ok: true, args };
}

function parseValue(field: ArgumentField): { ok: true; value: unknown } | { ok: false; problem: ArgumentProblem } {
	const { type, value } = field;
	if (type === 'boolean' || typeof value === 'boolean') {
		return { ok: true, value };
	}
	if (type === 'number') {
		const number = Number.parseFloat(value);
		return Number.isNaN(number) ? { ok: false, problem: 'invalidNumber' } : { ok: true, value: number };
	}
	if (type === 'object' || type === 'array') {
		try {
			return { ok: true, value: JSON.parse(value) as unknown };
		} catch {
			return { ok: false, problem: 'invalidJson' };
		}
	}
	return { ok: true, value };
}
