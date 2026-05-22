import { ToolRegistry } from '../tool-registry';
import type { ToolSource } from '../tool-source';
import type { SourceTool, ToolSourceKind } from '@/types/common/tools';

/** Build a fake tool that returns a fixed result. */
function fakeTool(name: string): SourceTool {
	return {
		definition: { name, description: `${name} description`, parameters: [] },
		execute: async (args) => ({ success: true, result: { name, args } }),
	};
}

/** Build a fake ToolSource; hooks can override load/dispose behaviour. */
function fakeSource(
	kind: ToolSourceKind,
	id: string,
	tools: SourceTool[],
	hooks: Partial<Pick<ToolSource, 'load' | 'dispose'>> = {},
): ToolSource {
	return {
		kind,
		id,
		label: id,
		load: hooks.load ?? (async () => tools),
		dispose: hooks.dispose ?? (async () => {}),
	};
}

describe('ToolRegistry - aggregation', () => {
	it('aggregates tools from registered sources after reload', async () => {
		const registry = new ToolRegistry();
		registry.registerSource(fakeSource('builtin', 'builtin', [fakeTool('read_file')]));
		await registry.reload();
		const tools = registry.getTools();
		expect(tools).toHaveLength(1);
		expect(tools[0].toolId).toBe('builtin:builtin:read_file');
		expect(tools[0].llmName).toBe('read_file');
		expect(tools[0].origin).toEqual({ kind: 'builtin', sourceId: 'builtin' });
	});

	it('returns no tools before reload is called', () => {
		const registry = new ToolRegistry();
		registry.registerSource(fakeSource('cli', 'c1', [fakeTool('run')]));
		expect(registry.getTools()).toHaveLength(0);
	});

	it('looks tools up by id and by llm name', async () => {
		const registry = new ToolRegistry();
		registry.registerSource(fakeSource('builtin', 'builtin', [fakeTool('read_file')]));
		await registry.reload();
		expect(registry.getToolById('builtin:builtin:read_file')?.llmName).toBe('read_file');
		expect(registry.getToolByLlmName('read_file')?.toolId).toBe('builtin:builtin:read_file');
		expect(registry.getToolById('missing')).toBeUndefined();
		expect(registry.getToolByLlmName('missing')).toBeUndefined();
	});
});

describe('ToolRegistry - llm name disambiguation', () => {
	it('suffixes colliding llm names deterministically by source order', async () => {
		const registry = new ToolRegistry();
		registry.registerSource(fakeSource('mcp', 'alpha', [fakeTool('search')]));
		registry.registerSource(fakeSource('mcp', 'beta', [fakeTool('search')]));
		await registry.reload();
		const [first, second] = registry.getTools();
		expect(first.llmName).toBe('search');
		expect(first.toolId).toBe('mcp:alpha:search');
		expect(second.llmName).toBe('search_2');
		expect(second.toolId).toBe('mcp:beta:search');
	});

	it('sanitizes characters illegal in function names', async () => {
		const registry = new ToolRegistry();
		registry.registerSource(fakeSource('cli', 'c1', [fakeTool('my.fancy tool!')]));
		await registry.reload();
		expect(registry.getTools()[0].llmName).toBe('my_fancy_tool_');
		expect(registry.getTools()[0].toolId).toBe('cli:c1:my.fancy tool!');
	});

	it('disambiguates names that collide only after sanitization', async () => {
		const registry = new ToolRegistry();
		registry.registerSource(fakeSource('mcp', 'alpha', [fakeTool('my.search')]));
		registry.registerSource(fakeSource('mcp', 'beta', [fakeTool('my search')]));
		await registry.reload();
		const [first, second] = registry.getTools();
		expect(first.llmName).toBe('my_search');
		expect(first.toolId).toBe('mcp:alpha:my.search');
		expect(second.llmName).toBe('my_search_2');
		expect(second.toolId).toBe('mcp:beta:my search');
	});
});

describe('ToolRegistry - reload failure isolation', () => {
	it('skips a source whose load() rejects without affecting others', async () => {
		const registry = new ToolRegistry();
		registry.registerSource(
			fakeSource('mcp', 'broken', [], {
				load: async () => {
					throw new Error('connect failed');
				},
			}),
		);
		registry.registerSource(fakeSource('builtin', 'builtin', [fakeTool('read_file')]));
		await registry.reload();
		const tools = registry.getTools();
		expect(tools).toHaveLength(1);
		expect(tools[0].toolId).toBe('builtin:builtin:read_file');
	});
});
