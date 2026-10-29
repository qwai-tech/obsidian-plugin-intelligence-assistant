import { parseToolArguments } from '@/presentation/components/modals/mcp-tool-arguments';

describe('parseToolArguments', () => {
	it('converts values by declared type and skips empty optional fields', () => {
		expect(parseToolArguments([
			{ name: 'query', type: 'string', required: true, value: 'notes' },
			{ name: 'limit', type: 'number', required: false, value: '2.5' },
			{ name: 'recursive', type: 'boolean', required: false, value: true },
			{ name: 'filter', type: 'object', required: false, value: '{"tag":"a"}' },
			{ name: 'paths', type: 'array', required: false, value: '["a","b"]' },
			{ name: 'unused', type: 'string', required: false, value: '' },
		])).toEqual({ ok: true, args: { query: 'notes', limit: 2.5, recursive: true, filter: { tag: 'a' }, paths: ['a', 'b'] } });
	});

	it('reports a missing required field', () => {
		expect(parseToolArguments([{ name: 'query', type: 'string', required: true, value: '' }]))
			.toEqual({ ok: false, problem: 'requiredMissing', name: 'query' });
	});

	it('reports an invalid number', () => {
		expect(parseToolArguments([{ name: 'limit', type: 'number', required: false, value: 'many' }]))
			.toEqual({ ok: false, problem: 'invalidNumber', name: 'limit' });
	});

	it('reports invalid JSON', () => {
		expect(parseToolArguments([{ name: 'filter', type: 'object', required: false, value: '{bad' }]))
			.toEqual({ ok: false, problem: 'invalidJson', name: 'filter' });
	});
});
