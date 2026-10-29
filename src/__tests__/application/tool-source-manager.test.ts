import { ToolRegistry } from '@/application/tools/tool-registry';
import { ToolSourceManager, type ToolSourceFactory, type ToolSourceSettings } from '@/application/tools/tool-source-manager';
import type { ToolSource } from '@/application/tools/tool-source';
import type { MCPServerConfig, OpenApiToolConfig, CLIToolConfig } from '@/types';
import type { SourceTool, ToolSourceKind } from '@/types/common/tools';

const tool = (name: string): SourceTool => ({
	definition: { name, description: name, parameters: [] },
	execute: async () => ({ success: true, result: name }),
});

interface FakeSource extends ToolSource {
	loads: number;
	disposed: boolean;
}

const fakeSource = (kind: ToolSourceKind, id: string, toolNames: string[]): FakeSource => {
	const source: FakeSource = {
		kind,
		id,
		label: id,
		loads: 0,
		disposed: false,
		load: async () => {
			source.loads++;
			return toolNames.map(tool);
		},
		dispose: async () => {
			source.disposed = true;
		},
	};
	return source;
};

const server = (name: string, overrides: Partial<MCPServerConfig> = {}): MCPServerConfig => ({
	name,
	command: 'npx',
	enabled: true,
	connectionMode: 'auto',
	...overrides,
});

const setup = (settings: ToolSourceSettings) => {
	const created: FakeSource[] = [];
	const openApiRequests: Array<{ id: string; refetch: boolean }> = [];
	const track = (source: FakeSource) => {
		created.push(source);
		return source;
	};
	const factory: ToolSourceFactory = {
		builtin: () => track(fakeSource('builtin', 'builtin', ['read_file'])),
		mcp: (config) => {
			const source = track(fakeSource('mcp', config.name, [`${config.name}_tool`]));
			if (config.command === 'missing-binary') {
				source.load = async () => { throw new Error('spawn failed'); };
			}
			return source;
		},
		openApi: (config, options) => {
			openApiRequests.push({ id: config.id, refetch: options?.refetch ?? false });
			return track(fakeSource('openapi', config.id, [`${config.id}_a`, `${config.id}_b`]));
		},
		cli: (config) => track(fakeSource('cli', config.id, [`${config.id}_run`])),
	};
	const registry = new ToolRegistry();
	const persist = jest.fn(async () => undefined);
	const manager = new ToolSourceManager(registry, factory, () => settings, persist);
	return { manager, registry, persist, created, openApiRequests };
};

const names = (registry: ToolRegistry) => registry.getTools().map((t) => t.definition.name).sort();

describe('ToolSourceManager', () => {
	it('loads built-in tools plus every enabled MCP, OpenAPI and CLI source', async () => {
		const { manager, registry } = setup({
			builtInTools: [],
			mcpServers: [server('alpha'), server('off', { enabled: false })],
			openApiTools: [{ id: 'api', enabled: true } as OpenApiToolConfig, { id: 'gone', enabled: false } as OpenApiToolConfig],
			cliTools: [{ id: 'git', enabled: true } as CLIToolConfig],
		});

		await manager.initialize();

		expect(names(registry)).toEqual(['alpha_tool', 'api_a', 'api_b', 'git_run', 'read_file']);
	});

	it('caches the tools of each loaded MCP server and persists once', async () => {
		const alpha = server('alpha');
		const { manager, persist } = setup({ builtInTools: [], mcpServers: [alpha], openApiTools: [], cliTools: [] });

		await manager.initialize();

		expect(alpha.cachedTools?.map((t) => t.name)).toEqual(['alpha_tool']);
		expect(persist).toHaveBeenCalledTimes(1);
	});

	it('does not persist when no MCP server produced tools', async () => {
		const { manager, persist } = setup({ builtInTools: [], mcpServers: [], openApiTools: [], cliTools: [] });

		await manager.initialize();

		expect(persist).not.toHaveBeenCalled();
	});

	it('reloadCli swaps stale CLI sources for the enabled configs', async () => {
		const settings: ToolSourceSettings = { builtInTools: [], mcpServers: [], openApiTools: [], cliTools: [{ id: 'git', enabled: true } as CLIToolConfig] };
		const { manager, registry } = setup(settings);
		await manager.initialize();

		settings.cliTools = [{ id: 'npm', enabled: true } as CLIToolConfig];
		await manager.reloadCli();

		expect(names(registry)).toEqual(['npm_run', 'read_file']);
	});

	it('reloadOpenApi returns the tool count, and zero once the config is disabled', async () => {
		const config = { id: 'api', enabled: true } as OpenApiToolConfig;
		const { manager, registry } = setup({ builtInTools: [], mcpServers: [], openApiTools: [config], cliTools: [] });

		expect(await manager.reloadOpenApi('api')).toBe(2);
		config.enabled = false;
		expect(await manager.reloadOpenApi('api')).toBe(0);
		expect(registry.hasSource('openapi', 'api')).toBe(false);
	});

	it('reloadOpenApi asks the source to refetch the spec only when requested', async () => {
		const { manager, openApiRequests } = setup({ builtInTools: [], mcpServers: [], openApiTools: [{ id: 'api', enabled: true } as OpenApiToolConfig], cliTools: [] });

		await manager.reloadOpenApi('api');
		await manager.reloadOpenApi('api', { refetch: true });

		expect(openApiRequests).toEqual([{ id: 'api', refetch: false }, { id: 'api', refetch: true }]);
	});

	it('connectMcp registers the server, caches its tools and persists; disconnectMcp unregisters it', async () => {
		const beta = server('beta', { connectionMode: 'manual' });
		const { manager, registry, persist } = setup({ builtInTools: [], mcpServers: [beta], openApiTools: [], cliTools: [] });

		expect(await manager.connectMcp(beta)).toBe(1);
		expect(registry.hasSource('mcp', 'beta')).toBe(true);
		expect(beta.cachedTools?.map((t) => t.name)).toEqual(['beta_tool']);
		expect(persist).toHaveBeenCalledTimes(1);

		await manager.disconnectMcp('beta');
		expect(registry.hasSource('mcp', 'beta')).toBe(false);
	});

	it('refreshMcpServers reloads every enabled server, reports failures and persists once', async () => {
		const settings: ToolSourceSettings = {
			builtInTools: [],
			mcpServers: [server('ok'), server('broken', { command: 'missing-binary' }), server('off', { enabled: false })],
			openApiTools: [],
			cliTools: [],
		};
		const { manager, persist, created } = setup(settings);

		const results = await manager.refreshMcpServers();

		expect(results).toEqual([
			{ server: 'ok', tools: 1 },
			{ server: 'broken', tools: 0, error: 'spawn failed' },
		]);
		expect(created.some((s) => s.id === 'off')).toBe(false);
		expect(persist).toHaveBeenCalledTimes(1);
	});

	it('probeMcp loads and disposes a throw-away source without registering it', async () => {
		const gamma = server('gamma');
		const { manager, registry, created } = setup({ builtInTools: [], mcpServers: [], openApiTools: [], cliTools: [] });

		const cached = await manager.probeMcp(gamma);

		expect(cached.map((t) => t.name)).toEqual(['gamma_tool']);
		expect(created[0].disposed).toBe(true);
		expect(registry.hasSource('mcp', 'gamma')).toBe(false);
	});

	it('connectAutoMcpServers connects only enabled auto-mode servers that are not yet connected', async () => {
		const settings: ToolSourceSettings = {
			builtInTools: [],
			mcpServers: [server('auto'), server('manual', { connectionMode: 'manual' }), server('off', { enabled: false })],
			openApiTools: [],
			cliTools: [],
		};
		const { manager, registry } = setup(settings);

		expect(await manager.connectAutoMcpServers()).toBe(true);
		expect(registry.hasSource('mcp', 'auto')).toBe(true);
		expect(registry.hasSource('mcp', 'manual')).toBe(false);
		expect(await manager.connectAutoMcpServers()).toBe(false);
	});
});
