import { initI18n } from '@/i18n';
import { displayToolsTab } from '../tools-tab';

describe('displayToolsTab', () => {
	beforeEach(() => {
		initI18n('en');
	});

	function makePlugin() {
		return {
			settings: {
				mcpServers: [],
			},
			getToolRegistry: () => ({
				getTools: () => [],
			}),
		};
	}

	it('shows an add MCP tools action when the MCP tools list is empty', () => {
		const container = document.createElement('div');
		const openMcpManagement = jest.fn();

		displayToolsTab(
			container,
			makePlugin() as never,
			'mcp',
			jest.fn(),
			jest.fn(),
			openMcpManagement
		);

		expect(container.textContent).toContain('No MCP tools available');
		expect(container.textContent).toContain('Add MCP tools');

		const addButton = Array.from(container.querySelectorAll('button'))
			.find((button) => button.textContent === 'Add MCP tools');
		addButton?.click();

		expect(openMcpManagement).toHaveBeenCalledTimes(1);
	});
});
