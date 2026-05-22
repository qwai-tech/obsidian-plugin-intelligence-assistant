import { McpToolSource } from '../mcp-tool-source';
import { MCPClient } from '@/application/services/mcp-client';
import type { MCPTool } from '@/application/services/mcp-client';
import type { MCPServerConfig } from '@/types/features/mcp';

jest.mock('@/application/services/mcp-client');

/** Typed access to the auto-mocked MCPClient constructor. */
const MockedMCPClient = MCPClient as jest.MockedClass<typeof MCPClient>;

/** Sample MCP tool definitions returned by a fake server. */
const SAMPLE_TOOLS: MCPTool[] = [
	{
		name: 'search_docs',
		description: 'Search documents',
		inputSchema: {
			type: 'object',
			properties: { query: { type: 'string', description: 'Query text' } },
			required: ['query'],
		},
	},
	{
		name: 'fetch_page',
		description: 'Fetch a page',
		inputSchema: { type: 'object', properties: {} },
	},
];

/** Build a fake MCPClient instance with overridable behaviour. */
function buildClientMock(overrides: Partial<jest.Mocked<MCPClient>> = {}): jest.Mocked<MCPClient> {
	return {
		connect: jest.fn().mockResolvedValue(undefined),
		disconnect: jest.fn().mockResolvedValue(undefined),
		listTools: jest.fn().mockResolvedValue(SAMPLE_TOOLS),
		callTool: jest.fn().mockResolvedValue('ok'),
		isConnected: jest.fn().mockReturnValue(true),
		getServerName: jest.fn().mockReturnValue('test-server'),
		...overrides,
	} as unknown as jest.Mocked<MCPClient>;
}

function makeConfig(overrides: Partial<MCPServerConfig> = {}): MCPServerConfig {
	return {
		name: 'test-server',
		command: 'node',
		args: ['server.js'],
		enabled: true,
		...overrides,
	};
}

beforeEach(() => {
	MockedMCPClient.mockClear();
});

describe('McpToolSource', () => {
	it('exposes mcp kind with id and label derived from the server name', () => {
		const source = new McpToolSource(makeConfig());
		expect(source.kind).toBe('mcp');
		expect(source.id).toBe('test-server');
		expect(source.label).toBe('test-server');
	});

	it('connects and wraps every tool returned by listTools', async () => {
		const client = buildClientMock();
		MockedMCPClient.mockImplementation(() => client);

		const source = new McpToolSource(makeConfig());
		const tools = await source.load();

		expect(client.connect).toHaveBeenCalledTimes(1);
		expect(client.listTools).toHaveBeenCalledTimes(1);
		expect(tools.map((t) => t.definition.name)).toEqual(['search_docs', 'fetch_page']);
	});

	it('produces wrapped tools whose execute delegates to callTool', async () => {
		const client = buildClientMock();
		MockedMCPClient.mockImplementation(() => client);

		const source = new McpToolSource(makeConfig());
		const tools = await source.load();
		const result = await tools[0].execute({ query: 'hello' });

		expect(client.callTool).toHaveBeenCalledWith('search_docs', { query: 'hello' });
		expect(result.success).toBe(true);
	});

	it('propagates a connect failure so the registry can isolate it', async () => {
		const client = buildClientMock({
			connect: jest.fn().mockRejectedValue(new Error('connection refused')),
		});
		MockedMCPClient.mockImplementation(() => client);

		const source = new McpToolSource(makeConfig());
		await expect(source.load()).rejects.toThrow('connection refused');
	});

	it('disconnects the client on dispose', async () => {
		const client = buildClientMock();
		MockedMCPClient.mockImplementation(() => client);

		const source = new McpToolSource(makeConfig());
		await source.load();
		await source.dispose();

		expect(client.disconnect).toHaveBeenCalledTimes(1);
	});

	it('dispose is a safe no-op when load was never called', async () => {
		const source = new McpToolSource(makeConfig());
		await expect(source.dispose()).resolves.toBeUndefined();
	});

	it('disconnects on dispose even after a failed load', async () => {
		const client = buildClientMock({
			connect: jest.fn().mockRejectedValue(new Error('connection refused')),
		});
		MockedMCPClient.mockImplementation(() => client);

		const source = new McpToolSource(makeConfig());
		await expect(source.load()).rejects.toThrow('connection refused');
		await expect(source.dispose()).resolves.toBeUndefined();
		expect(client.disconnect).toHaveBeenCalledTimes(1);
	});
});
