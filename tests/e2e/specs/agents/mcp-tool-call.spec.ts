import * as path from 'node:path';
import { ChatViewPage } from '../../pages/chat/chat-view.page';
import { McpSettingsPage } from '../../pages/settings/mcp-settings.page';
import { createAgentConfig } from '../../support/data-fixtures';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { mockLLM } from '../../support/mock-llm';
import { VaultFixture } from '../../support/vault-fixture';

interface StreamChatRequest {
	stream?: boolean;
	messages?: Array<{ role: string; content: string }>;
	tools?: Array<{ type: string; function: { name: string } }>;
}

describe('Agent MCP tool call', () => {
	const chat = new ChatViewPage();
	const mcpSettings = new McpSettingsPage();
	const vault = new VaultFixture();

	beforeEach(async () => {
		await vault.reset();
		await mockLLM.clearAll();
		await waitForPluginReady();

		const scriptPath = path.resolve('tests/e2e/support/mock-mcp-server.js');
		await mcpSettings.open();
		await mcpSettings.addServer({
			name: 'e2e-mcp',
			command: 'node',
			args: scriptPath,
		});
		await mcpSettings.connectServer('e2e-mcp');

		await vault.seedSettings({
			agents: [createAgentConfig({
				id: 'agent-mcp-only',
				name: 'MCP Only Agent',
				toolAccess: { sources: { 'mcp:e2e-mcp': 'all' } },
			})],
			activeAgentId: 'agent-mcp-only',
		});

		await chat.open();
		await chat.newChat();
	});

	it('executes an MCP-sourced tool through the agent loop', async () => {
		await mockLLM.toolCall('vault_echo', { text: 'route-c' }, 'call_mcp_echo');
		await mockLLM.replyWith('The MCP tool returned MCP_SENTINEL route-c.');

		await chat.selectMode('agent');
		await chat.sendMessage('Use the MCP echo tool with route-c.');
		await chat.waitForReplyComplete(20_000);

		const traceText = await chat.getToolTraceText();
		await expect(traceText).toContain('vault_echo');
		await expect(traceText).toContain('MCP_SENTINEL route-c');
		await expect(await chat.getLastAssistantText()).toContain('MCP_SENTINEL route-c');

		const calls = (await mockLLM.getCalls())
			.map(call => call.body as StreamChatRequest | null)
			.filter(body => body?.stream === true);

		await expect(calls).toHaveLength(2);
		await expect(calls[0]?.tools?.map(tool => tool.function.name)).toEqual(['vault_echo']);
		await expect(calls[1]?.messages).toEqual(expect.arrayContaining([
			expect.objectContaining({
				role: 'tool',
				content: expect.stringContaining('MCP_SENTINEL route-c'),
			}),
		]));
	});
});
