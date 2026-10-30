import { ToolRegistry } from '@/features/tools/tool-registry';
import { ToolSourceManager, type ToolSourceFactory, type ToolSourceSettings } from '@/features/tools/tool-source-manager';
import type { ToolSource } from '@/features/tools/tool-source';
import type { MCPServerConfig } from '@/features/tools/types/mcp';
import type { OpenApiToolConfig } from '@/features/tools/types/openapi-tools';
import type { CLIToolConfig } from '@/features/tools/types/cli-tools';
import type { SourceTool, ToolSourceKind } from '@/features/tools/types/tools';

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
	const update = jest.fn(async (change: (current: ToolSourceSettings) => void) => change(settings));
	const manager = new ToolSourceManager(registry, factory, () => settings, update);
	return { manager, registry, update, created, openApiRequests };
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

	it('caches the tools of each loaded MCP server and saves them', async () => {
		const alpha = server('alpha');
		const { manager, update } = setup({ builtInTools: [], mcpServers: [alpha], openApiTools: [], cliTools: [] });

		await manager.initialize();

		expect(alpha.cachedTools?.map((t) => t.name)).toEqual(['alpha_tool']);
		expect(update).toHaveBeenCalledTimes(1);
	});

	it('does not update when no MCP server produced tools', async () => {
		const { manager, update } = setup({ builtInTools: [], mcpServers: [], openApiTools: [], cliTools: [] });

		await manager.initialize();

		expect(update).not.toHaveBeenCalled();
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

	it('connectMcp registers the server, caches its tools; disconnectMcp unregisters it', async () => {
		const beta = server('beta', { connectionMode: 'manual' });
		const { manager, registry, update } = setup({ builtInTools: [], mcpServers: [beta], openApiTools: [], cliTools: [] });

		expect(await manager.connectMcp(beta)).toBe(1);
		expect(registry.hasSource('mcp', 'beta')).toBe(true);
		expect(beta.cachedTools?.map((t) => t.name)).toEqual(['beta_tool']);
		expect(update).toHaveBeenCalledTimes(1);

		await manager.disconnectMcp('beta');
		expect(registry.hasSource('mcp', 'beta')).toBe(false);
	});

	it('refreshMcpServers reloads every enabled server, reports failures and saves them', async () => {
		const settings: ToolSourceSettings = {
			builtInTools: [],
			mcpServers: [server('ok'), server('broken', { command: 'missing-binary' }), server('off', { enabled: false })],
			openApiTools: [],
			cliTools: [],
		};
		const { manager, update, created } = setup(settings);

		const results = await manager.refreshMcpServers();

		expect(results).toEqual([
			{ server: 'ok', tools: 1 },
			{ server: 'broken', tools: 0, error: 'spawn failed' },
		]);
		expect(created.some((s) => s.id === 'off')).toBe(false);
		expect(update).toHaveBeenCalledTimes(1);
	});

	it('starts only auto-connect servers at startup', async () => {
		const { manager, registry } = setup({
			builtInTools: [],
			mcpServers: [server('auto'), server('manual', { connectionMode: 'manual' })],
			openApiTools: [],
			cliTools: [],
		});

		await manager.initialize();

		expect(manager.isMcpConnected('auto')).toBe(true);
		expect(manager.isMcpConnected('manual')).toBe(false);
		expect(names(registry)).toEqual(['auto_tool', 'read_file']);
	});

	it('a server that fails to start is not shown as connected, and auto-connect tries it again', async () => {
		const broken = server('broken', { command: 'missing-binary' });
		const { manager, created } = setup({ builtInTools: [], mcpServers: [broken], openApiTools: [], cliTools: [] });

		await manager.initialize();
		await expect(manager.connectMcp(broken)).rejects.toThrow('spawn failed');

		expect(manager.isMcpConnected('broken')).toBe(false);
		expect(created.filter((source) => source.id === 'broken').every((source) => source.disposed)).toBe(true);
		broken.command = 'npx';
		expect(await manager.connectAutoMcpServers()).toBe(true);
		expect(manager.isMcpConnected('broken')).toBe(true);
	});

	it('restarts a running server whose command changed, and replaces a renamed one', async () => {
		const settings: ToolSourceSettings = {
			builtInTools: [],
			mcpServers: [server('edited'), server('renamed'), server('same')],
			openApiTools: [],
			cliTools: [],
		};
		const { manager, created } = setup(settings);
		await manager.initialize();
		const running = (name: string) => created.filter((source) => source.id === name);

		settings.mcpServers = [server('edited', { args: ['--new'] }), server('new-name'), server('same')];
		await manager.syncMcpServers();

		expect(running('edited').map((source) => source.disposed)).toEqual([true, false]);
		expect(running('renamed').every((source) => source.disposed)).toBe(true);
		expect(manager.isMcpConnected('renamed')).toBe(false);
		expect(manager.isMcpConnected('new-name')).toBe(true);
		expect(running('same')).toHaveLength(1);
		expect(running('same')[0].loads).toBe(1);
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

	it('resyncs sources with settings changed from outside', async () => {
		const settings: ToolSourceSettings = {
			builtInTools: [],
			mcpServers: [server('keep'), server('drop')],
			openApiTools: [{ id: 'old-api', enabled: true } as OpenApiToolConfig],
			cliTools: [],
		};
		const { manager, registry, created } = setup(settings);
		await manager.initialize();

		settings.mcpServers = [server('keep'), server('drop', { enabled: false }), server('added')];
		settings.openApiTools = [{ id: 'new-api', enabled: true } as OpenApiToolConfig];
		settings.cliTools = [{ id: 'echo', enabled: true } as CLIToolConfig];
		await manager.resync();

		expect(names(registry)).toEqual(['added_tool', 'echo_run', 'keep_tool', 'new-api_a', 'new-api_b', 'read_file']);
		expect(created.find(source => source.id === 'drop')?.disposed).toBe(true);
		expect(created.find(source => source.id === 'old-api')?.disposed).toBe(true);
	});
});

