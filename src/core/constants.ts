

// Default Agent
export const DEFAULT_AGENT_ID = 'builtin-generalist-agent';

// Default Model Configuration
export const DEFAULT_MODEL_CONFIG = {
	FALLBACK_MODEL: 'gpt-4o',
	MAX_TOKENS: 6000,
	CONTEXT_WINDOW: 20,
} as const;

export const DEFAULT_CHAT_SAMPLING = {
	temperature: 0.7,
	maxTokens: 4000,
	topP: 1,
	frequencyPenalty: 0,
	presencePenalty: 0,
} as const;

// Memory Configuration
export const DEFAULT_MEMORY_CONFIG = {
	SUMMARY_INTERVAL: 10,
	MAX_MEMORIES: 50,
} as const;

/** Fallback step budget when the agent does not declare an estimate. */
export const DEFAULT_MAX_STEPS = 25;

/** Hard ceiling on agent steps — a runaway/cost backstop the agent can never exceed. */
export const MAX_STEPS_CEILING = 50;
