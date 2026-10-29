import { pluginPaths } from '@/core/plugin-paths';

describe('pluginPaths', () => {
	it('keeps the existing layout for the default config folder', () => {
		const paths = pluginPaths('.obsidian');

		expect(paths.userConfig).toBe('.obsidian/plugins/intelligence-assistant/config/user/settings.json');
		expect(paths.tokenUsage).toBe('.obsidian/plugins/intelligence-assistant/data/token-usage.json');
		expect(paths.vectorStoreNotes).toBe('.obsidian/plugins/intelligence-assistant/data/vector_store/notes.json');
		expect(paths.mcpToolsCache).toBe('.obsidian/plugins/intelligence-assistant/data/cache/mcp-tools');
	});

	it('follows a custom config folder', () => {
		const paths = pluginPaths('.vault-config');

		expect(paths.base).toBe('.vault-config/plugins/intelligence-assistant');
		expect(paths.conversations).toBe('.vault-config/plugins/intelligence-assistant/data/conversations');
		expect(paths.agentMemory).toBe('.vault-config/plugins/intelligence-assistant/data/agent-memory/memory.json');
	});
});
