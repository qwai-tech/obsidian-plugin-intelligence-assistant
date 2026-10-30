import { pluginPaths } from '@/core/plugin-paths';

describe('pluginPaths', () => {
	it('lays every file out under the plugin folder', () => {
		const paths = pluginPaths('.obsidian/plugins/intelligence-assistant');

		expect(paths.userConfig).toBe('.obsidian/plugins/intelligence-assistant/config/user/settings.json');
		expect(paths.tokenUsage).toBe('.obsidian/plugins/intelligence-assistant/data/token-usage.json');
		expect(paths.vectorStoreNotes).toBe('.obsidian/plugins/intelligence-assistant/data/vector_store/notes.json');
		expect(paths.mcpToolsCache).toBe('.obsidian/plugins/intelligence-assistant/data/cache/mcp-tools');
	});

	it('follows the folder the plugin was installed in', () => {
		const paths = pluginPaths('.vault-config/plugins/ia-fork');

		expect(paths.base).toBe('.vault-config/plugins/ia-fork');
		expect(paths.conversations).toBe('.vault-config/plugins/ia-fork/data/conversations');
		expect(paths.agentMemory).toBe('.vault-config/plugins/ia-fork/data/agent-memory/memory.json');
	});
});
