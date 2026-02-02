/**
 * E2E Tests for MCP Tool Management
 */

import { closeSettings, navigateToPluginSettings } from '../../utils/actions';
import {

	openMcpTab,
	addMcpServer,
	cleanMcpServers,
	refreshAllMcpTools,
	getMcpToolCount
} from '../../utils/mcp-helpers';
import { SELECTORS } from '../../utils/selectors';

describe('MCP Settings - Tool Management', () => {
	beforeEach(async () => {
		await navigateToPluginSettings();
		await openMcpTab();
	});

	afterEach(async () => {
		await cleanMcpServers();
		await closeSettings();
	});

	it('should show zero tools for new server', async () => {
		const serverName = 'ToolTest-New';
		await addMcpServer({
			name: serverName,
			command: 'echo',
			connectionMode: 'manual'
		});

		const count = await getMcpToolCount(serverName);
		expect(count).toBe(0);
	});

	it('should allow refreshing tools', async () => {
		const serverName = 'ToolTest-Refresh';
		await addMcpServer({
			name: serverName,
			command: 'echo',
			connectionMode: 'manual'
		});

		// Click refresh all
		await refreshAllMcpTools();
		
		// Since 'echo' is not a real server, count will stay 0, but we verify the action completes
		const count = await getMcpToolCount(serverName);
		expect(count).toBeDefined();
	});

	it('should display tool count badge', async () => {
		const serverName = 'ToolTest-Badge';
		await addMcpServer({
			name: serverName,
			command: 'echo',
			connectionMode: 'manual'
		});

		// Verify badge exists in DOM even if 0
		const badge = await $(SELECTORS.mcp.toolCountBadge(serverName));
		expect(await badge.isExisting()).toBe(true);
	});
});