/**
 * Tests for Phase 4 config schema migration.
 */
import { userConfigToPluginSettings, pluginSettingsToUserConfig } from '@/types/settings';
import type { UserConfig, PluginSettings } from '@/types';
import type { MCPServerConfig, MCPRegistry } from '@/types/features/mcp';
import type { BuiltInToolConfig } from '@/types/common/tools';
import type { OpenApiToolConfig } from '@/types/features/openapi-tools';
import type { CLIToolConfig } from '@/types/features/cli-tools';

function sampleBuiltInTools(): BuiltInToolConfig[] {
	return [
		{ type: 'read_file', enabled: true },
		{ type: 'write_file', enabled: false },
	];
}

function sampleMCPServers(): MCPServerConfig[] {
	return [
		{ name: 'filesystem', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'], enabled: true },
	];
}

function sampleOpenApiTools(): OpenApiToolConfig[] {
	return [
		{ id: 'petstore', name: 'Petstore API', enabled: true, sourceType: 'url', specUrl: 'https://example.com/openapi.json', specPath: '', baseUrl: '', authType: 'none', authKey: '', authValue: '' },
	];
}

function sampleCLITools(): CLIToolConfig[] {
	return [
		{ id: 'my-cli', name: 'My Tool', description: 'A CLI tool', command: 'echo', enabled: true },
	];
}

function makeOldUserConfig(): Record<string, unknown> {
	return {
		version: 1,
		providers: { list: [], defaultModel: '', titleSummaryModel: '' },
		conversations: { title: { mode: 'first-message', prompt: '' }, icon: { enabled: true }, activeId: null },
		mcp: { servers: sampleMCPServers(), registries: [] },
		tools: { builtIn: sampleBuiltInTools(), openApi: sampleOpenApiTools(), cli: sampleCLITools() },
		rag: { enabled: false, retrieval: {} as any, embedding: {} as any, caching: {} as any, grader: { thresholds: {} as any } as any },
		search: { web: { enabled: false, provider: 'duckduckgo', maxResults: 5 } as any },
		prompts: { system: [], activeId: null },
		agents: { list: [], activeId: null, memories: [] },
	};
}

function newStyleUserConfig(tools: Record<string, unknown>): UserConfig {
	return {
		version: 1,
		providers: { list: [], defaultModel: '', titleSummaryModel: '' },
		conversations: { title: { mode: 'first-message', prompt: '' }, icon: { enabled: true }, activeId: null },
		tools: tools as any,
		rag: { enabled: false, retrieval: {} as any, embedding: {} as any, caching: {} as any, grader: { thresholds: {} as any } as any },
		search: { web: { enabled: false, provider: 'duckduckgo', maxResults: 5 } as any },
		prompts: { system: [], activeId: null },
		agents: { list: [], activeId: null, memories: [] },
	} as unknown as UserConfig;
}

describe('Phase 4: Config schema migration', () => {
	describe('reads from new config.tools.* paths', () => {
		it('reads mcp servers and registries from config.tools.mcp', () => {
			const cfg = newStyleUserConfig({
				builtin: [], mcp: { servers: sampleMCPServers(), registries: [] },
				openapi: [], cli: [],
			});
			const s = userConfigToPluginSettings(cfg);
			expect(s.mcpServers).toEqual(sampleMCPServers());
		});

		it('reads builtin tools from config.tools.builtin', () => {
			const cfg = newStyleUserConfig({
				builtin: sampleBuiltInTools(), mcp: { servers: [], registries: [] },
				openapi: [], cli: [],
			});
			const s = userConfigToPluginSettings(cfg);
			expect(s.builtInTools).toEqual(sampleBuiltInTools());
		});

		it('reads openapi tools from config.tools.openapi', () => {
			const cfg = newStyleUserConfig({
				builtin: [], mcp: { servers: [], registries: [] },
				openapi: sampleOpenApiTools(), cli: [],
			});
			const s = userConfigToPluginSettings(cfg);
			expect(s.openApiTools).toEqual(sampleOpenApiTools());
		});

		it('reads cli tools from config.tools.cli', () => {
			const cfg = newStyleUserConfig({
				builtin: [], mcp: { servers: [], registries: [] },
				openapi: [], cli: sampleCLITools(),
			});
			const s = userConfigToPluginSettings(cfg);
			expect(s.cliTools).toEqual(sampleCLITools());
		});
	});

	describe('falls back to old config paths', () => {
		it('reads mcp from old config.mcp', () => {
			const s = userConfigToPluginSettings(makeOldUserConfig() as unknown as UserConfig);
			expect(s.mcpServers).toEqual(sampleMCPServers());
		});

		it('reads builtin from old config.tools.builtIn', () => {
			const s = userConfigToPluginSettings(makeOldUserConfig() as unknown as UserConfig);
			expect(s.builtInTools).toEqual(sampleBuiltInTools());
		});

		it('reads openapi from old config.tools.openApi', () => {
			const s = userConfigToPluginSettings(makeOldUserConfig() as unknown as UserConfig);
			expect(s.openApiTools).toEqual(sampleOpenApiTools());
		});

		it('reads cli from old config.tools.cli', () => {
			const s = userConfigToPluginSettings(makeOldUserConfig() as unknown as UserConfig);
			expect(s.cliTools).toEqual(sampleCLITools());
		});
	});

	describe('falls back to defaults', () => {
		it('returns empty arrays for absent fields', () => {
			const cfg = newStyleUserConfig({
				builtin: [], mcp: { servers: [], registries: [] },
				openapi: [], cli: [],
			});
			const s = userConfigToPluginSettings(cfg);
			expect(s.mcpServers).toEqual([]);
			expect(s.builtInTools).toEqual([]);
			expect(s.openApiTools).toEqual([]);
			expect(s.cliTools).toEqual([]);
		});
	});

	describe('pluginSettingsToUserConfig writes new structure', () => {
		it('outputs config.tools.{builtin,mcp,openapi,cli}', () => {
			const settings: PluginSettings = {
				llmConfigs: [], defaultModel: '', titleSummaryModel: '', defaultChatMode: 'chat',
				conversationTitleMode: 'first-message', titleSummaryPrompt: '', conversationIconEnabled: true,
				conversations: [], activeConversationId: null,
				mcpServers: sampleMCPServers(), mcpRegistries: [],
				builtInTools: sampleBuiltInTools(), openApiTools: sampleOpenApiTools(), cliTools: sampleCLITools(),
				ragConfig: {} as any, webSearchConfig: { enabled: false } as any,
				systemPrompts: [], activeSystemPromptId: null,
				agents: [], agentMemories: [], activeAgentId: null,
				quickActions: [], quickActionPrefix: '',
			};
			const uc = pluginSettingsToUserConfig(settings);
			expect(uc.tools.builtin).toEqual(sampleBuiltInTools());
			// Phase 6: mcp.servers is now persisted via pluginSettingsToUserConfig
			// in addition to the per-server repository, so config.tools.mcp.servers
			// is the full server list (Phase 4 schema unification).
			expect(uc.tools.mcp.servers).toEqual(sampleMCPServers());
			expect(uc.tools.openapi).toEqual(sampleOpenApiTools());
			expect(uc.tools.cli).toEqual(sampleCLITools());
			expect((uc as any).mcp).toBeUndefined();
		});
	});

	describe('round-trip', () => {
		it('preserves tool data through round-trip', () => {
			const cfg = newStyleUserConfig({
				builtin: sampleBuiltInTools(),
				mcp: { servers: sampleMCPServers(), registries: [] },
				openapi: sampleOpenApiTools(), cli: sampleCLITools(),
			});
			const rt = pluginSettingsToUserConfig(userConfigToPluginSettings(cfg));
			expect(rt.tools.builtin).toEqual(sampleBuiltInTools());
			expect(rt.tools.openapi).toEqual(sampleOpenApiTools());
			expect(rt.tools.cli).toEqual(sampleCLITools());
		});

		it('old config round-trips to new structure', () => {
			const s = userConfigToPluginSettings(makeOldUserConfig() as unknown as UserConfig);
			const rt = pluginSettingsToUserConfig(s);
			expect(rt.tools.builtin).toEqual(sampleBuiltInTools());
			expect(rt.tools.openapi).toEqual(sampleOpenApiTools());
			expect(rt.tools.cli).toEqual(sampleCLITools());
			expect((rt as any).mcp).toBeUndefined();
		});
	});
});
