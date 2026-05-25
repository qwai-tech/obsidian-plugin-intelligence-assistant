/**
 * Test support utilities for creating test fixtures.
 */

import type { Agent, LLMConfig, PluginSettings, Conversation } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';
import { migrateAgentToolAccess } from '@/application/tools/tool-migrations';

/**
 * Legacy per-source enable arrays. Removed from the Agent type in Phase 6
 * but still accepted as test overrides so existing test cases that
 * construct agents with `enabledBuiltInTools: ['x']` keep working — the
 * fields are migrated into `toolAccess` before the agent is returned.
 */
interface LegacyAgentOverrides {
	enabledBuiltInTools?: string[];
	enabledMcpServers?: string[];
	enabledMcpTools?: string[];
	enabledCLITools?: string[];
	enabledAllCLITools?: boolean;
}

export function createTestAgent(
	overrides: Partial<Agent> & LegacyAgentOverrides = {},
): Agent {
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
		memoryType: 'none',
		memoryConfig: { summaryInterval: 10, maxMemories: 50 },
		ragEnabled: false,
		webSearchEnabled: false,
		maxSteps: 10,
		createdAt: now,
		updatedAt: now,
		...overrides,
	};

	// If the test supplied legacy per-source overrides without an explicit
	// toolAccess, synthesize toolAccess from them. The migration reads the
	// fields off the agent in place (it doesn't know they're not part of
	// Agent anymore) and strips them.
	const overrodeToolAccess = 'toolAccess' in overrides;
	const hasLegacyOverrides =
		'enabledBuiltInTools' in overrides ||
		'enabledMcpServers' in overrides ||
		'enabledMcpTools' in overrides ||
		'enabledCLITools' in overrides ||
		'enabledAllCLITools' in overrides;

	if (!overrodeToolAccess && hasLegacyOverrides) {
		const cliIds = (overrides.enabledCLITools ?? []).slice();
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
