/**
 * LLM Common Types
 * Shared types for LLM providers.
 *
 * The wire-level contracts moved to `@qwai/obsidian-llm`. Only one thing is
 * app-specific and stays here: `ChatRequest.messages`.
 *
 * The package deliberately types messages as `LLMMessage` -- role, content, and
 * the few fields that actually reach the network -- because a reusable provider
 * cannot depend on this app's much richer `Message` (RAG sources, web-search
 * results, agent execution steps, reasoning traces). This app still wants the
 * rich type on its own requests, so it narrows that one field. `Message` remains
 * structurally assignable to `LLMMessage`, so app requests pass to any provider
 * unchanged.
 */

import type { Message } from '../core/conversation';
import type { ChatRequest as WireChatRequest } from '@qwai/obsidian-llm';

export interface ChatRequest extends Omit<WireChatRequest, 'messages'> {
	messages: Message[];
}

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
