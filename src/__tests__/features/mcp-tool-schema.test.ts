import { MCPToolWrapper } from '@/features/tools/mcp-tool-wrapper';
import { validateToolArguments } from '@/features/tools/tool-schema';
import { ToolRegistry } from '@/features/tools/tool-registry';
import { snapshotMcpTools } from '@/features/tools/mcp-helpers';

const client = { getServerName: () => 'srv' } as never;
const properties = {
	id: { anyOf: [{ type: 'string' }, { type: 'number' }], description: 'Id' },
	note: { type: ['string', 'null'], description: 'Note' },
	filter: { type: 'object', properties: { tag: { type: 'string' } }, description: 'Filter' },
	limit: { type: 'integer', description: 'Limit' },
};
const wrapper = new MCPToolWrapper({ name: 'find', inputSchema: { type: 'object', properties, required: ['id'] } }, client);

describe('MCP tool schemas', () => {
	it('accepts any member of a union, and null for an optional parameter', () => {
		expect(validateToolArguments(wrapper.definition, { id: 7, note: null }).success).toBe(true);
		expect(validateToolArguments(wrapper.definition, { id: 'a', note: 'x', filter: { tag: 't' }, limit: 2 }).success).toBe(true);
		expect(validateToolArguments(wrapper.definition, { id: 'a', limit: 'two' }).success).toBe(false);
	});

	it('drops nulls for optional parameters before the tool runs', () => {
		const result = validateToolArguments(wrapper.definition, { id: 'a', note: null });

		expect(result).toEqual({ success: true, data: { id: 'a' } });
	});

	it('tells the LLM, and the offline cache, the schema the server published', () => {
		const registry = new ToolRegistry();
		const [registered] = [{ toolId: 'mcp:srv:find', llmName: 'find', origin: { kind: 'mcp' as const, sourceId: 'srv' }, definition: wrapper.definition, execute: wrapper.execute.bind(wrapper) }];

		const [fn] = registry.toOpenAIFunctions([registered]);
		const [cached] = snapshotMcpTools([registered]);

		expect(fn.function.parameters).toEqual({ type: 'object', properties, required: ['id'] });
		expect(cached.inputSchema).toEqual({ type: 'object', properties, required: ['id'] });
	});
});
