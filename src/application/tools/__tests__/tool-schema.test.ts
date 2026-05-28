import { z } from 'zod';
import { createToolDefinition, validateToolArguments } from '@/application/tools/tool-schema';

describe('tool-schema', () => {
	it('validates required string arguments', () => {
		const definition = createToolDefinition({
			name: 'read_file',
			description: 'Read file',
			parameters: [{ name: 'path', type: 'string', description: 'Path', required: true }],
			inputSchema: z.object({ path: z.string().min(1) }),
		});

		expect(validateToolArguments(definition, { path: 'A.md' }).success).toBe(true);
		expect(validateToolArguments(definition, { path: '' }).success).toBe(false);
	});

	it('falls back to parameter-derived schema when inputSchema is absent', () => {
		const definition = createToolDefinition({
			name: 'search_files',
			description: 'Search',
			parameters: [
				{ name: 'query', type: 'string', description: 'Query', required: true },
				{ name: 'limit', type: 'number', description: 'Limit', required: false },
			],
		});

		const valid = validateToolArguments(definition, { query: 'ai', limit: 5 });
		const invalid = validateToolArguments(definition, { limit: 5 });

		expect(valid.success).toBe(true);
		expect(invalid.success).toBe(false);
	});
});
