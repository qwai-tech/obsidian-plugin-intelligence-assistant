import {
	parseToolArguments,
	serializeToolResult,
	toJsonObject,
	toJsonValue,
} from '@/application/agents/kernel/json-utils';

describe('json-utils', () => {
	describe('parseToolArguments', () => {
		it('parses a JSON object into a plain object', () => {
			expect(parseToolArguments('{"path":"a.md","n":2}')).toEqual({ path: 'a.md', n: 2 });
		});

		it('returns {} for a JSON array (not an object)', () => {
			expect(parseToolArguments('[1,2,3]')).toEqual({});
		});

		it('returns {} for a JSON primitive', () => {
			expect(parseToolArguments('42')).toEqual({});
			expect(parseToolArguments('"hello"')).toEqual({});
			expect(parseToolArguments('true')).toEqual({});
		});

		it('returns {} for JSON null', () => {
			expect(parseToolArguments('null')).toEqual({});
		});

		it('returns {} for invalid/truncated JSON', () => {
			expect(parseToolArguments('{"path":"a.md"')).toEqual({});
			expect(parseToolArguments('not json')).toEqual({});
			expect(parseToolArguments('')).toEqual({});
		});

		it('deep-converts a nested object', () => {
			expect(parseToolArguments('{"a":{"b":[1,{"c":2}]}}')).toEqual({ a: { b: [1, { c: 2 }] } });
		});
	});

	describe('serializeToolResult', () => {
		it('serializes an object to JSON', () => {
			expect(serializeToolResult({ status: 'applied', path: 'a.md' })).toBe('{"status":"applied","path":"a.md"}');
		});

		it('serializes a string with quotes', () => {
			expect(serializeToolResult('hi')).toBe('"hi"');
		});

		it('returns the literal "null" when JSON.stringify yields undefined', () => {
			expect(serializeToolResult(undefined)).toBe('null');
			expect(serializeToolResult(() => 1)).toBe('null');
		});

		it('serializes JSON null as "null"', () => {
			expect(serializeToolResult(null)).toBe('null');
		});
	});

	describe('toJsonObject', () => {
		it('returns the object for a plain object', () => {
			expect(toJsonObject({ a: 1 })).toEqual({ a: 1 });
		});

		it('returns {} for an array', () => {
			expect(toJsonObject([1, 2])).toEqual({});
		});

		it('returns {} for null and for primitives', () => {
			expect(toJsonObject(null)).toEqual({});
			expect(toJsonObject(5)).toEqual({});
			expect(toJsonObject('x')).toEqual({});
			expect(toJsonObject(undefined)).toEqual({});
		});

		it('strips undefined-valued properties (via JSON round-trip)', () => {
			expect(toJsonObject({ a: 1, b: undefined })).toEqual({ a: 1 });
		});
	});

	describe('toJsonValue', () => {
		it('returns null for undefined', () => {
			expect(toJsonValue(undefined)).toBeNull();
		});

		it('returns null when JSON.stringify yields undefined (function/symbol)', () => {
			expect(toJsonValue(() => 1)).toBeNull();
			expect(toJsonValue(Symbol('x'))).toBeNull();
		});

		it('deep-clones a value through JSON', () => {
			const src = { a: [1, { b: 2 }], c: 'x' };
			const out = toJsonValue(src);
			expect(out).toEqual(src);
			expect(out).not.toBe(src);
		});

		it('passes primitives through', () => {
			expect(toJsonValue(42)).toBe(42);
			expect(toJsonValue('s')).toBe('s');
			expect(toJsonValue(true)).toBe(true);
			expect(toJsonValue(null)).toBeNull();
		});
	});
});
