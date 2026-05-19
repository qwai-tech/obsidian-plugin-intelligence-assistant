/**
 * CLI Agent Types
 * Configuration for SDK-based CLI agents (Claude Code, Codex, Qwen Code)
 */

// Re-export SDKPackageInfo so consumers can import from @/types
export type { SDKPackageInfo } from '@/infrastructure/cli-agent/sdk-installer';

export type CLIAgentProvider = 'claude-code' | 'codex' | 'qwen-code';

export type CLIAgentPermissionMode = 'default' | 'plan' | 'auto-edit' | 'bypass';

/**
 * CLI Agent — flat config combining provider settings and agent behavior.
 */
export interface CLIAgentConfig {
	id: string;
	name: string;
	description: string;
	icon: string;
	provider: CLIAgentProvider;

	// Basic behavior
	model?: string;
	systemPrompt?: string;
	permissionMode: CLIAgentPermissionMode;

	// Auth override (optional — CLIs have their own auth mechanisms)
	apiKey?: string;
	baseUrl?: string;                      // Codex
	authType?: 'openai' | 'qwen-oauth';   // Qwen

	// Agent behavior
	maxTurns?: number;
	cwd?: string;
	env?: Record<string, string>;
	allowedTools?: string[];
	disallowedTools?: string[];

	// Provider-specific SDK options
	mcpServers?: Record<string, unknown>;
	maxBudgetUsd?: number;                 // Claude: global budget cap
	fallbackModel?: string;                // Claude
	enableFileCheckpointing?: boolean;     // Claude
	sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';  // Codex
	networkAccessEnabled?: boolean;        // Codex
	webSearchMode?: 'disabled' | 'cached' | 'live';  // Codex
	skipGitRepoCheck?: boolean;            // Codex
	debug?: boolean;                       // Qwen

	// Agent-specific SDK overrides
	maxThinkingTokens?: number;         // Claude
	additionalDirectories?: string[];   // Claude, Codex
	modelReasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';  // Codex
	maxSessionTurns?: number;           // Qwen

	createdAt: number;
	updatedAt: number;
}

/** Display label for a CLI provider */
export const CLI_PROVIDER_LABELS: Record<CLIAgentProvider, string> = {
	'claude-code': 'Claude Code',
	'codex': 'Codex',
	'qwen-code': 'Qwen Code'
};

/**
 * Normalized message from CLI agent SDK execution
 */
export interface CLIAgentMessage {
	type: 'text' | 'tool-use' | 'tool-result' | 'error' | 'done';
	content: string;
	toolName?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Result of a CLI agent execution
 */
export interface CLIAgentResult {
	success: boolean;
	content: string;
	sessionId?: string;
	usage?: {
		inputTokens: number;
		outputTokens: number;
		totalCostUsd?: number;
	};
	durationMs?: number;
}

// ---------------------------------------------------------------------------
// Migration helpers — convert old two-tier (provider + agent) to flat config
// ---------------------------------------------------------------------------

/** @deprecated Legacy provider config — used only for migration from old settings */
export interface CLIProviderConfig_Legacy {
	id: string;
	provider: CLIAgentProvider;
	apiKey?: string;
	baseUrl?: string;
	authType?: 'openai' | 'qwen-oauth';
	mcpServers?: Record<string, unknown>;
	maxBudgetUsd?: number;
	fallbackModel?: string;
	enableFileCheckpointing?: boolean;
	sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
	networkAccessEnabled?: boolean;
	webSearchMode?: 'disabled' | 'cached' | 'live';
	skipGitRepoCheck?: boolean;
	debug?: boolean;
	createdAt: number;
	updatedAt: number;
}

/** @deprecated Legacy agent config — used only for migration from old settings */
export interface CLIAgentConfig_Legacy {
	id: string;
	name: string;
	description: string;
	icon: string;
	providerId: string;
	model?: string;
	systemPrompt?: string;
	permissionMode: CLIAgentPermissionMode;
	maxTurns?: number;
	cwd?: string;
	env?: Record<string, string>;
	allowedTools?: string[];
	disallowedTools?: string[];
	maxThinkingTokens?: number;
	additionalDirectories?: string[];
	modelReasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
	maxSessionTurns?: number;
	createdAt: number;
	updatedAt: number;
}

/** Migrate old two-tier configs to flat CLIAgentConfig */
/* eslint-disable @typescript-eslint/no-deprecated -- intentional: reads legacy format during migration */
export function migrateCliConfigs(
	oldProviders: CLIProviderConfig_Legacy[],
	oldAgents: CLIAgentConfig_Legacy[]
): CLIAgentConfig[] {
/* eslint-enable @typescript-eslint/no-deprecated -- re-enable after legacy params */
	return oldAgents.map(agent => {
		const prov = oldProviders.find(p => p.id === agent.providerId);
		const { providerId: _pid, ...rest } = agent;
		return {
			...rest,
			provider: prov?.provider ?? 'claude-code' as CLIAgentProvider,
			apiKey: prov?.apiKey,
			baseUrl: prov?.baseUrl,
			authType: prov?.authType,
			mcpServers: prov?.mcpServers,
			maxBudgetUsd: prov?.maxBudgetUsd,
			fallbackModel: prov?.fallbackModel,
			enableFileCheckpointing: prov?.enableFileCheckpointing,
			sandboxMode: prov?.sandboxMode,
			networkAccessEnabled: prov?.networkAccessEnabled,
			webSearchMode: prov?.webSearchMode,
			skipGitRepoCheck: prov?.skipGitRepoCheck,
			debug: prov?.debug,
		};
	});
}
