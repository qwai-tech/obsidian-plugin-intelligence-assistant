import { ToolRegistry } from '../tool-registry';
import type { ToolSource } from '../tool-source';
import type { AgentToolAccess, SourceTool, ToolSourceKind } from '@/types/common/tools';
import { z } from 'zod';
import { createToolDefinition } from '@/application/tools/tool-schema';

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

	it('reload preserves the previous successful snapshot when a source later fails', async () => {
		const registry = new ToolRegistry();
		let mode: 'ok' | 'fail' = 'ok';
		const flaky: ToolSource = {
			kind: 'mcp',
			id: 'flaky',
			label: 'flaky',
			load: async () => {
				if (mode === 'fail') throw new Error('disconnected');
				return [fakeTool('search')];
			},
			dispose: async () => {},
		};
		registry.registerSource(flaky);

		await registry.reload();
		expect(registry.getTools().map((t) => t.toolId)).toEqual(['mcp:flaky:search']);

		// Simulate transient failure on the next reload — the cached tool
		// should stick around instead of being wiped to [].
		mode = 'fail';
		await registry.reload();
		expect(registry.getTools().map((t) => t.toolId)).toEqual(['mcp:flaky:search']);
	});

	it('reloadSource preserves the previous snapshot when load() throws', async () => {
		const registry = new ToolRegistry();
		let mode: 'ok' | 'fail' = 'ok';
		const flaky: ToolSource = {
			kind: 'mcp',
			id: 'flaky',
			label: 'flaky',
			load: async () => {
				if (mode === 'fail') throw new Error('disconnected');
				return [fakeTool('search')];
			},
			dispose: async () => {},
		};
		registry.registerSource(flaky);

		await registry.reloadSource('mcp', 'flaky');
		expect(registry.getTools()).toHaveLength(1);

		mode = 'fail';
		await expect(registry.reloadSource('mcp', 'flaky')).rejects.toThrow('disconnected');
		// The cached tool is still present — caller still sees the last
		// known-good state and can choose to retry or unregister.
		expect(registry.getTools().map((t) => t.toolId)).toEqual(['mcp:flaky:search']);
	});

	it('serializes concurrent reloadSource calls (no interleaved load() runs)', async () => {
		const registry = new ToolRegistry();
		const order: string[] = [];

		const makeFlaky = (id: string, delayMs: number): ToolSource => ({
			kind: 'mcp',
			id,
			label: id,
			load: async () => {
				order.push(`${id}:start`);
				await new Promise((res) => setTimeout(res, delayMs));
				order.push(`${id}:end`);
				return [fakeTool(`tool_of_${id}`)];
			},
			dispose: async () => {},
		});

		registry.registerSource(makeFlaky('a', 30));
		registry.registerSource(makeFlaky('b', 10));

		await Promise.all([
			registry.reloadSource('mcp', 'a'),
			registry.reloadSource('mcp', 'b'),
		]);

		// Without serialization, b:start would land between a:start and a:end.
		// With serialization, a runs to completion before b starts.
		expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
	});

	it('reload seeds an empty snapshot for a source that fails on its first load', async () => {
		const registry = new ToolRegistry();
		registry.registerSource(
			fakeSource('mcp', 'never-worked', [], {
				load: async () => {
					throw new Error('first time fail');
				},
			}),
		);
		await registry.reload();
		expect(registry.getTools()).toEqual([]);
	});
});

describe('ToolRegistry - executeTool', () => {
	it('executes a tool by its llm name', async () => {
		const registry = new ToolRegistry();
		registry.registerSource(fakeSource('builtin', 'builtin', [fakeTool('read_file')]));
		await registry.reload();
		const result = await registry.executeTool('read_file', { path: 'x' });
		expect(result.success).toBe(true);
		expect(result.result).toEqual({ name: 'read_file', args: { path: 'x' } });
	});

	it('routes a disambiguated name to the correct tool', async () => {
		const registry = new ToolRegistry();
		registry.registerSource(fakeSource('mcp', 'alpha', [fakeTool('search')]));
		registry.registerSource(fakeSource('mcp', 'beta', [fakeTool('search')]));
		await registry.reload();
		const result = await registry.executeTool('search_2', {});
		expect(result.result).toMatchObject({ name: 'search' });
		expect(registry.getToolByLlmName('search_2')?.toolId).toBe('mcp:beta:search');
	});

	it('returns a failure result for an unknown tool name', async () => {
		const registry = new ToolRegistry();
		const result = await registry.executeTool('nope', {});
		expect(result.success).toBe(false);
		expect(result.error).toContain('Tool not found');
	});

	it('catches errors thrown by tool execution', async () => {
		const registry = new ToolRegistry();
		const throwing: SourceTool = {
			definition: { name: 'boom', description: 'boom', parameters: [] },
			execute: async () => {
				throw new Error('kaboom');
			},
		};
		registry.registerSource(fakeSource('cli', 'c1', [throwing]));
		await registry.reload();
		const result = await registry.executeTool('boom', {});
		expect(result.success).toBe(false);
		expect(result.error).toContain('kaboom');
	});

	it('rejects invalid tool arguments before execution', async () => {
		const registry = new ToolRegistry();
		const execute = jest.fn(async () => ({ success: true, result: 'ok' }));
		registry.registerSource({
			kind: 'builtin',
			id: 'builtin',
			label: 'Built-in Tools',
			load: async () => [{
				definition: createToolDefinition({
					name: 'read_file',
					description: 'Read file',
					parameters: [{ name: 'path', type: 'string', description: 'Path', required: true }],
					inputSchema: z.object({ path: z.string().min(1) }),
				}),
				execute,
			}],
			dispose: async () => undefined,
		});
		await registry.reload();

		const result = await registry.executeTool('read_file', { path: '' });

		expect(result.success).toBe(false);
		expect(result.error).toContain('Invalid arguments');
		expect(execute).not.toHaveBeenCalled();
	});

	it('rejects vault-write tools that do not return write proposals', async () => {
		const registry = new ToolRegistry();
		registry.registerSource({
			kind: 'builtin',
			id: 'builtin',
			label: 'Built-in Tools',
			load: async () => [{
				definition: createToolDefinition({
					name: 'write_file',
					description: 'Write file',
					parameters: [{ name: 'path', type: 'string', description: 'Path', required: true }],
					sideEffects: { vaultWrite: true },
				}),
				execute: async () => ({ success: true, result: 'wrote directly' }),
			}],
			dispose: async () => undefined,
		});
		await registry.reload();

		const result = await registry.executeTool('write_file', { path: 'A.md' });

		expect(result.success).toBe(false);
		expect(result.error).toContain('must return a write proposal');
	});
});

describe('ToolRegistry - resolveForAgent', () => {
	async function registryWithTools(): Promise<ToolRegistry> {
		const registry = new ToolRegistry();
		registry.registerSource(
			fakeSource('builtin', 'builtin', [fakeTool('read_file'), fakeTool('write_file')]),
		);
		registry.registerSource(fakeSource('mcp', 'alpha', [fakeTool('search')]));
		await registry.reload();
		return registry;
	}

	it("includes every tool of a source mapped to 'all'", async () => {
		const registry = await registryWithTools();
		const access: AgentToolAccess = { sources: { 'builtin:builtin': 'all' } };
		const resolved = registry.resolveForAgent(access);
		expect(resolved.map((t) => t.toolId)).toEqual([
			'builtin:builtin:read_file',
			'builtin:builtin:write_file',
		]);
	});

	it('includes only the listed tool ids when a source maps to an array', async () => {
		const registry = await registryWithTools();
		const access: AgentToolAccess = {
			sources: { 'builtin:builtin': ['builtin:builtin:write_file'] },
		};
		const resolved = registry.resolveForAgent(access);
		expect(resolved.map((t) => t.toolId)).toEqual(['builtin:builtin:write_file']);
	});

	it('excludes tools whose source is absent from the access map', async () => {
		const registry = await registryWithTools();
		const access: AgentToolAccess = { sources: { 'builtin:builtin': 'all' } };
		const resolved = registry.resolveForAgent(access);
		expect(resolved.some((t) => t.origin.kind === 'mcp')).toBe(false);
	});

	it('returns nothing for an empty access map', async () => {
		const registry = await registryWithTools();
		expect(registry.resolveForAgent({ sources: {} })).toHaveLength(0);
	});
});

describe('ToolRegistry - unregisterSource', () => {
	it('disposes the source and drops its tools', async () => {
		const registry = new ToolRegistry();
		const disposed: string[] = [];
		registry.registerSource(
			fakeSource('mcp', 'alpha', [fakeTool('search')], {
				dispose: async () => {
					disposed.push('alpha');
				},
			}),
		);
		registry.registerSource(fakeSource('builtin', 'builtin', [fakeTool('read_file')]));
		await registry.reload();
		await registry.unregisterSource('mcp', 'alpha');
		expect(disposed).toEqual(['alpha']);
		expect(registry.getTools().map((t) => t.toolId)).toEqual(['builtin:builtin:read_file']);
	});

	it('re-disambiguates remaining tools after a source is removed', async () => {
		const registry = new ToolRegistry();
		registry.registerSource(fakeSource('mcp', 'alpha', [fakeTool('search')]));
		registry.registerSource(fakeSource('mcp', 'beta', [fakeTool('search')]));
		await registry.reload();
		expect(registry.getToolByLlmName('search_2')?.toolId).toBe('mcp:beta:search');
		await registry.unregisterSource('mcp', 'alpha');
		expect(registry.getToolByLlmName('search')?.toolId).toBe('mcp:beta:search');
		expect(registry.getToolByLlmName('search_2')).toBeUndefined();
	});

	it('is a no-op for an unknown source', async () => {
		const registry = new ToolRegistry();
		await expect(registry.unregisterSource('cli', 'ghost')).resolves.toBeUndefined();
	});
});

describe('ToolRegistry - dispose', () => {
	it('disposes every source and clears all tools', async () => {
		const registry = new ToolRegistry();
		const disposed: string[] = [];
		registry.registerSource(
			fakeSource('mcp', 'alpha', [fakeTool('search')], {
				dispose: async () => {
					disposed.push('alpha');
				},
			}),
		);
		registry.registerSource(
			fakeSource('cli', 'c1', [fakeTool('run')], {
				dispose: async () => {
					disposed.push('c1');
				},
			}),
		);
		await registry.reload();
		await registry.dispose();
		expect(disposed.sort()).toEqual(['alpha', 'c1']);
		expect(registry.getTools()).toHaveLength(0);
	});
});

describe('ToolRegistry - LLM format conversion', () => {
	async function registryWithParamTool(): Promise<ToolRegistry> {
		const registry = new ToolRegistry();
		const tool: SourceTool = {
			definition: {
				name: 'search',
				description: 'Search the vault',
				parameters: [
					{ name: 'query', type: 'string', description: 'Search query', required: true },
					{ name: 'scope', type: 'string', description: 'Where to search', enum: ['notes', 'all'] },
				],
			},
			execute: async () => ({ success: true }),
		};
		registry.registerSource(fakeSource('builtin', 'builtin', [tool]));
		await registry.reload();
		return registry;
	}

	it('converts tools to OpenAI function format using the llm name', async () => {
		const registry = await registryWithParamTool();
		const fns = registry.toOpenAIFunctions(registry.getTools());
		expect(fns).toEqual([
			{
				type: 'function',
				function: {
					name: 'search',
					description: 'Search the vault',
					parameters: {
						type: 'object',
						properties: {
							query: { type: 'string', description: 'Search query' },
							scope: { type: 'string', description: 'Where to search', enum: ['notes', 'all'] },
						},
						required: ['query'],
					},
				},
			},
		]);
	});

	it('converts tools to Anthropic tool format using the llm name', async () => {
		const registry = await registryWithParamTool();
		const tools = registry.toAnthropicTools(registry.getTools());
		expect(tools).toEqual([
			{
				name: 'search',
				description: 'Search the vault',
				input_schema: {
					type: 'object',
					properties: {
						query: { type: 'string', description: 'Search query' },
						scope: { type: 'string', description: 'Where to search', enum: ['notes', 'all'] },
					},
					required: ['query'],
				},
			},
		]);
	});

	it('uses disambiguated names in converted output', async () => {
		const registry = new ToolRegistry();
		registry.registerSource(fakeSource('mcp', 'alpha', [fakeTool('search')]));
		registry.registerSource(fakeSource('mcp', 'beta', [fakeTool('search')]));
		await registry.reload();
		const names = registry.toOpenAIFunctions(registry.getTools()).map((f) => f.function.name);
		expect(names).toEqual(['search', 'search_2']);
	});
});
