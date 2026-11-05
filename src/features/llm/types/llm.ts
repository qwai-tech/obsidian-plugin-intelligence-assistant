/** The app and providers share one wire request contract, including tool-result messages. */

export type { ChatRequest } from '@qwai/obsidian-llm';

export type {
	ChatResponse,
	StreamChunk,
	TokenUsage,
	ProviderCapabilities,
	ModelConfig,
	LLMProviderConfig,
	TokenCount,
	ValidationResult,
	ConnectionTest,
	ILLMProvider,
	LLMMessage,
	LLMAttachment,
} from '@qwai/obsidian-llm';
