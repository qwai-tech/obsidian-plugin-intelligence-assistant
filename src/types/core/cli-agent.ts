/**
 * CLI Agent Types
 * Configuration for SDK-based CLI agents (Claude Code, Codex, Qwen Code)
 */

// Re-export SDKPackageInfo so consumers can import from @/types
export type { SDKPackageInfo } from '@/infrastructure/cli-agent/sdk-installer';

export type CLIAgentProvider = 'claude-code' | 'codex' | 'qwen-code';

export type CLIAgentPermissionMode = 'default' | 'plan' | 'auto-edit' | 'bypass';

/**
 * CLI Provider — SDK connection and provider-level config.
 * Analogous to LLMConfig for LLM providers.
 */
export interface CLIProviderConfig {
	id: string;
	provider: CLIAgentProvider;

	// Authentication
	apiKey?: string;
	baseUrl?: string;                      // Codex
	authType?: 'openai' | 'qwen-oauth';   // Qwen

	// Provider-level SDK options
	mcpServers?: Record<string, unknown>;
	maxBudgetUsd?: number;                 // Claude: global budget cap
	fallbackModel?: string;                // Claude
	enableFileCheckpointing?: boolean;     // Claude
	sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';  // Codex
	networkAccessEnabled?: boolean;        // Codex
	webSearchMode?: 'disabled' | 'cached' | 'live';  // Codex
	skipGitRepoCheck?: boolean;            // Codex
	debug?: boolean;                       // Qwen

	createdAt: number;
	updatedAt: number;
}

/**
 * CLI Agent — references a CLI Provider and adds agent behavior config.
 * Analogous to Agent which references model strategies.
 */
export interface CLIAgentConfig {
	id: string;
	name: string;
	description: string;
	icon: string;
	providerId: string;  // References CLIProviderConfig.id

	// Agent behavior
	model?: string;
	systemPrompt?: string;
	permissionMode: CLIAgentPermissionMode;
	maxTurns?: number;
	cwd?: string;
	env?: Record<string, string>;
	allowedTools?: string[];
	disallowedTools?: string[];

	// Agent-specific SDK overrides
	maxThinkingTokens?: number;         // Claude
	additionalDirectories?: string[];   // Claude, Codex
	modelReasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';  // Codex
	maxSessionTurns?: number;           // Qwen

	createdAt: number;
	updatedAt: number;
}

/** Auto-generated display label for a CLI provider */
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
