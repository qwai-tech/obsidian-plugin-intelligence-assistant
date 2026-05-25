/**
 * Test support utilities for creating test fixtures.
 */

import type { Agent, LLMConfig, PluginSettings, Conversation } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';
import { migrateAgentToolAccess } from '@/application/tools/tool-migrations';

export function createTestAgent(overrides: Partial<Agent> = {}): Agent {
	const now = Date.now();
	const base: Agent = {
		id: 'test-agent-1',
		name: 'Test Agent',
		description: 'A test agent',
		icon: '🤖',
		modelStrategy: { strategy: 'default', modelId: '' },
		temperature: 0.7,
		maxTokens: 1000,
		systemPromptId: 'default',
		contextWindow: 20,
		toolAccess: { sources: {} },
		enabledBuiltInTools: [],
		enabledMcpServers: [],
		enabledMcpTools: [],
		memoryType: 'none',
		memoryConfig: { summaryInterval: 10, maxMemories: 50 },
		ragEnabled: false,
		webSearchEnabled: false,
		maxSteps: 10,
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
	// If the test supplied legacy per-source enable lists but not toolAccess,
	// synthesize toolAccess from them so the runtime (which only reads
	// toolAccess post-Phase 5) sees the intended tool set.
	if (!('toolAccess' in overrides)) {
		const cliIds = (base.enabledCLITools ?? []).slice();
		(base as { toolAccess?: unknown }).toolAccess = undefined;
		migrateAgentToolAccess(base, cliIds);
		base.toolAccess = base.toolAccess ?? { sources: {} };
	}
	return base;
}

export function createTestLLMConfig(overrides: Partial<LLMConfig> = {}): LLMConfig {
	return {
		provider: 'openai',
		apiKey: 'test-key',
		baseUrl: 'https://api.openai.com/v1',
		...overrides,
	};
}

export function createTestSettings(overrides: Partial<PluginSettings> = {}): PluginSettings {
	return {
		...DEFAULT_SETTINGS,
		llmConfigs: [createTestLLMConfig()],
		...overrides,
	};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test stub returns any
const fn = (): any => undefined;

export function createMockApp() {
	return {
		vault: {
			read: fn,
			create: fn,
			modify: fn,
			getFiles: () => [],
			getAbstractFileByPath: fn,
			adapter: { exists: fn, read: fn, write: fn },
		},
		metadataCache: {
			getFileCache: fn,
			getFirstLinkpathDest: fn,
		},
		workspace: {
			getActiveFile: fn,
			openLinkText: fn,
		},
	};
}

export function createTestConversation(overrides: Partial<Conversation> = {}): Conversation {
	const now = Date.now();
	return {
		id: 'test-conv-1',
		title: 'Test Conversation',
		messages: [],
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
}
