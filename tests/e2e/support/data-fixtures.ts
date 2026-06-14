import * as path from 'node:path';
import type { Agent, LLMConfig, MCPServerConfig, ModelInfo } from '@/types';

const DEFAULT_TIMESTAMP = 1_700_000_000_000;

export type VaultFixtureProfile = 'default' | 'with-multi-provider' | 'with-agent' | 'with-mcp';

export function createModelInfo(overrides: Partial<ModelInfo> = {}): ModelInfo {
	const provider = overrides.provider ?? 'openai';
	const id = overrides.id ?? `${provider}:gpt-4o-mini`;
	return {
		id,
		name: overrides.name ?? 'GPT-4o Mini',
		provider,
		capabilities: overrides.capabilities ?? ['chat', 'streaming', 'function_calling'],
		enabled: overrides.enabled ?? true,
		...overrides,
	};
}

export function createProviderConfig(overrides: Partial<LLMConfig> = {}): LLMConfig {
	const provider = overrides.provider ?? 'openai';
	const cachedModels = overrides.cachedModels ?? [createModelInfo({ provider })];
	return {
		provider,
		apiKey: provider === 'ollama' ? undefined : 'sk-e2e-fixture',
		baseUrl: provider === 'ollama' ? 'http://localhost:11434' : 'http://127.0.0.1:43117/v1',
		cachedModels,
		cacheTimestamp: DEFAULT_TIMESTAMP,
		...overrides,
	};
}

export function createAgentConfig(overrides: Partial<Agent> = {}): Agent {
	return {
		id: 'agent-e2e',
		name: 'E2E Agent',
		description: 'Deterministic E2E agent fixture',
		icon: 'bot',
		modelStrategy: { strategy: 'default' },
		temperature: 0.2,
		maxTokens: 4_000,
		systemPromptId: '',
		contextWindow: 20,
		toolAccess: { sources: { 'builtin:builtin': 'all' } },
		memoryType: 'none',
		memoryConfig: {
			summaryInterval: 5,
			maxMemories: 10,
		},
		ragEnabled: false,
		webSearchEnabled: false,
		maxSteps: 4,
		createdAt: DEFAULT_TIMESTAMP,
		updatedAt: DEFAULT_TIMESTAMP,
		...overrides,
	};
}

export function createMcpServerConfig(overrides: Partial<MCPServerConfig> = {}): MCPServerConfig {
	return {
		name: 'e2e-mcp',
		command: 'node',
		args: [path.resolve('tests/e2e/support/mock-mcp-server.js')],
		enabled: true,
		connectionMode: 'manual',
		cachedTools: [],
		cacheTimestamp: DEFAULT_TIMESTAMP,
		...overrides,
	};
}

export function createSettingsPatchForProfile(profile: VaultFixtureProfile): Record<string, unknown> {
	switch (profile) {
		case 'default':
			return {};
		case 'with-multi-provider': {
			const openai = createProviderConfig({
				provider: 'openai',
				cachedModels: [createModelInfo({ provider: 'openai', id: 'openai:gpt-4o-mini' })],
			});
			const anthropic = createProviderConfig({
				provider: 'anthropic',
				apiKey: 'sk-ant-e2e-fixture',
				baseUrl: 'http://127.0.0.1:43117/v1',
				cachedModels: [createModelInfo({ provider: 'anthropic', id: 'anthropic:claude-3-5-sonnet' })],
			});
			return {
				llmConfigs: [openai, anthropic],
				defaultModel: 'openai:gpt-4o-mini',
				titleSummaryModel: 'openai:gpt-4o-mini',
			};
		}
		case 'with-agent': {
			const agent = createAgentConfig();
			return {
				agents: [agent],
				activeAgentId: agent.id,
				defaultChatMode: 'agent',
			};
		}
		case 'with-mcp':
			return {
				mcpServers: [createMcpServerConfig()],
			};
	}
}
