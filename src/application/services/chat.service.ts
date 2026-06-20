/**
 * Chat Service
 * Core business logic for AI chat, coordinating RAG, Web Search, and LLM Providers.
 */

import type {
	Message,
	LLMConfig,
	RAGSource,
	WebSearchResult,
	FileReference,
	Agent
} from '@/types';
import { IFileSystem } from '@/core/interfaces';
import { ProviderFactory } from '@/infrastructure/llm/provider-factory';
import { ModelManager } from '@/infrastructure/llm/model-manager';
import type { RAGManager } from '@/infrastructure/rag-manager';
import type { WebSearchService } from './web-search-service';
import type { StreamChunk } from '@/types/common/llm';
import type { AgentEngineLoop, AgentLoopCallbacks } from '@/application/agents';

/**
 * Reference-content budget. Referenced notes are inlined into the prompt and
 * re-sent on every turn, so unbounded content (a few large @-mentioned notes)
 * silently inflates token cost each step. Cap per-file (matching the agent
 * sense service's 8000-char reference snapshot) and overall; on truncation the
 * agent is told it can read_file the full note on demand.
 */
export const MAX_REFERENCE_CHARS_PER_FILE = 8000;
export const MAX_REFERENCE_TOTAL_CHARS = 24000;

export interface ChatOptions {
	model: string;
	mode: 'chat' | 'agent';
	temperature?: number;
	maxTokens?: number;
	topP?: number;
	frequencyPenalty?: number;
	presencePenalty?: number;
	enableRAG?: boolean;
	enableWebSearch?: boolean;
	autoTriggerWebSearch?: boolean;
	activeSystemPrompts?: Message[];
	contextWindow?: number;
	tokenBudget?: number;
	conversationId?: string;
}

export function deduplicateMessages(messages: Message[]): Message[] {
	if (messages.length <= 1) return messages;
	const result: Message[] = [messages[0]];
	for (let i = 1; i < messages.length; i++) {
		const prev = messages[i - 1];
		const cur = messages[i];
		if (cur.role === prev.role && cur.content === prev.content) {
			continue;
		}
		result.push(cur);
	}
	return result;
}

export class ChatService {
	constructor(
		private fileSystem: IFileSystem,
		private ragManager: RAGManager,
		private webSearchService: WebSearchService,
		private llmConfigs: LLMConfig[],
		private usageRepo?: { recordUsage: (r: {model:string;provider:string;promptTokens:number;completionTokens:number;totalTokens:number;timestamp:number;conversationId?:string}) => Promise<void> },
		private defaultModel?: string,
		private agentEngineLoop?: AgentEngineLoop
	) {}

	findLLMConfig(modelId: string): LLMConfig | null {
		return ModelManager.findConfigForModelByProvider(modelId, this.llmConfigs);
	}

	/**
	 * Prepare messages for LLM, including formatting attachments and applying context window
	 */
	public prepareLlmMessages(
		allMessages: Message[], 
		targetMessage: Message, 
		llmContent: string, 
		contextWindow = 20
	): Message[] {
		const targetIndex = allMessages.indexOf(targetMessage);
		
		const formattedMessages = allMessages.map((msg, index) => {
			const isTarget = index === targetIndex;
			const baseContent = isTarget ? llmContent : msg.content;

			if (!msg.attachments || msg.attachments.length === 0) {
				return { role: msg.role, content: baseContent };
			}

			let finalContent = baseContent;
			
			// Format File Attachments
			const fileAttachments = msg.attachments.filter(att => att.type === 'file');
			if (fileAttachments.length > 0) {
				finalContent += '\n\n---\n**Attached Files:**\n\n';
				fileAttachments.forEach(att => {
					finalContent += `\n### File: ${att.name}\nPath: ${att.path}\n\n\`\`\`\n${att.content || ''}\n\`\`\`\n`;
				});
			}

			// Format Image Attachments (Metadata only for text models)
			const imageAttachments = msg.attachments.filter(att => att.type === 'image');
			if (imageAttachments.length > 0) {
				finalContent += '\n\n---\n**Attached Images:**\n\n';
				imageAttachments.forEach(att => {
					finalContent += `- Image: ${att.name} (Path: ${att.path})\n`;
				});
			}

			return { role: msg.role, content: finalContent };
		});

		// Deduplicate and Truncate
		const seen = new Set<string>();
		const deduped = formattedMessages.filter(msg => {
			const key = `${msg.role}:${msg.content}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});

		return deduped.slice(-contextWindow);
	}

	/**
	 * Build context from referenced files and folders
	 */
	async buildReferenceContext(
		text: string,
		references: FileReference[] = []
	): Promise<{ llmContent: string; references: FileReference[] }> {
		if (!references || references.length === 0) {
			return { llmContent: text, references: [] };
		}

		let llmContent = text + '\n\n---\n**Referenced Files/Folders:**\n\n';
		let totalChars = 0;
		for (const ref of references) {
			if (ref.type === 'file') {
				try {
					const content = await this.fileSystem.read(ref.path);
					const remaining = MAX_REFERENCE_TOTAL_CHARS - totalChars;
					if (remaining <= 0) {
						llmContent += `\n### 📄 ${ref.path}\n*(omitted to stay within the reference budget — call read_file("${ref.path}") if you need it)*\n`;
						continue;
					}
					const cap = Math.min(MAX_REFERENCE_CHARS_PER_FILE, remaining);
					let body = content;
					if (content.length > cap) {
						body = `${content.slice(0, cap)}\n…[truncated ${content.length - cap} chars — call read_file("${ref.path}") for the full note]`;
					}
					totalChars += Math.min(content.length, cap);
					llmContent += `\n### 📄 ${ref.path}\n\`\`\`\n${body}\n\`\`\`\n`;
				} catch (error) {
					llmContent += `\n### 📄 ${ref.path}\n*Error reading file: ${String(error)}*\n`;
				}
			} else {
				llmContent += `\n### 📁 ${ref.path}\n(Referenced as context)\n`;
			}
		}

		return { llmContent, references };
	}

	/**
	 * Main chat execution loop (Streaming)
	 */
	async streamResponse(
		messages: Message[],
		options: ChatOptions,
		callbacks: {
			onChunk: (chunk: StreamChunk) => void;
			onComplete: (finalMessage: Message) => void;
			onError: (error: Error) => void;
			onRAGSources?: (sources: RAGSource[]) => void;
			onWebSearch?: (results: WebSearchResult[]) => void;
			checkAbort?: () => boolean;
		}
	): Promise<void> {
		try {
			const { model: selectedModel } = options;
			const config = ModelManager.findConfigForModelByProvider(selectedModel, this.llmConfigs);
			
			if (!config) throw new Error(`No provider configuration found for model: ${selectedModel}`);

			const provider = ProviderFactory.createProvider(config);

			const systemMessages: Message[] = [...(options.activeSystemPrompts || [])];
			const userQuery = messages[messages.length - 1]?.content || '';

			// Note: streamResponse only ever runs in 'chat' mode. Agent mode is
			// routed to executeAgentLoop() by the controller before reaching here,
			// so there is no tool-calling system prompt to inject in this path.

			// Handle RAG
			let ragSources: RAGSource[] = [];
			if (options.enableRAG) {
				const searchResults = await this.ragManager.query(userQuery, selectedModel, this.defaultModel);
				if (searchResults && searchResults.length > 0) {
					ragSources = searchResults.map(r => ({
						path: r.chunk.metadata.path,
						content: r.chunk.content,
						similarity: r.similarity,
						title: r.chunk.metadata.title
					}));
					
					const ragContext = ragSources
						.map(s => `Document: ${s.path}\nContent: ${s.content}`)
						.join('\n\n');
						
					systemMessages.push({
						role: 'system',
						content: `RAG Context (retrieved from your vault):\n\n${ragContext}`
					});
					
					if (callbacks.onRAGSources) callbacks.onRAGSources(ragSources);
				}
			}

			// 3. Handle Web Search
			let webResults: WebSearchResult[] = [];
			if (options.enableWebSearch) {
				webResults = await this.webSearchService.search(userQuery);
				if (webResults && webResults.length > 0) {
					const webContext = this.webSearchService.formatResultsAsContext(webResults);
					systemMessages.push({ role: 'system', content: webContext });
					if (callbacks.onWebSearch) callbacks.onWebSearch(webResults);
				}
			}

			// 4. Prepare Final LLM Messages
			const finalMessages = [...systemMessages, ...messages];

			// 5. Stream from Provider
			// Use object wrapper: TypeScript 5.9 narrows callback-assigned let vars to their
			// initial value, making them `never` in truthy branches. Object properties avoid this.
			let fullContent = '';
			let fullReasoning = '';
			const streamState = { usage: null as { promptTokens: number; completionTokens: number; totalTokens: number } | null };

			await provider.streamChat(
				{
					messages: finalMessages,
					model: selectedModel,
					temperature: options.temperature,
					maxTokens: options.maxTokens,
					topP: options.topP,
					frequencyPenalty: options.frequencyPenalty,
					presencePenalty: options.presencePenalty
				},
				(chunk) => {
					if (callbacks.checkAbort && callbacks.checkAbort()) return;

					if (chunk.content) {
						fullContent += chunk.content;
						callbacks.onChunk(chunk);
					}
					if (chunk.usage) {
						streamState.usage = chunk.usage;
					}
					if (chunk.reasoning) {
						fullReasoning += chunk.reasoning;
						callbacks.onChunk(chunk);
					}
				}
			);

			const streamUsage = streamState.usage;

			// 6. Finalize Result
			const assistantMessage: Message = {
				role: 'assistant',
				content: fullContent,
				model: selectedModel,
				ragSources: ragSources.length > 0 ? ragSources : undefined,
				webSearchResults: webResults.length > 0 ? webResults : undefined,
				reasoningContent: fullReasoning || undefined,
				tokenUsage: streamUsage ? { promptTokens: streamUsage.promptTokens, completionTokens: streamUsage.completionTokens, totalTokens: streamUsage.totalTokens } : undefined,
			};

			if (this.usageRepo && streamUsage) {
				void this.usageRepo.recordUsage({
					model: selectedModel,
					provider: config.provider,
					promptTokens: streamUsage.promptTokens,
					completionTokens: streamUsage.completionTokens,
					totalTokens: streamUsage.totalTokens,
					timestamp: Date.now(),
					conversationId: options.conversationId
				});
			}

			callbacks.onComplete(assistantMessage);

		} catch (error) {
			callbacks.onError(error instanceof Error ? error : new Error(String(error)));
		}
	}

	/**
	 * Execute full agent loop: LLM call → parse tool calls → execute → repeat.
	 * Handles the ReAct pattern internally. ChatView only receives UI callbacks.
	 */
	async executeAgentLoop(
		messages: Message[],
		options: ChatOptions & {
			agentId?: string;
			agents?: Agent[];
			isGenericAgent?: boolean;
			references?: FileReference[];
		},
		callbacks: AgentLoopCallbacks
	): Promise<void> {
		if (!this.agentEngineLoop) {
			callbacks.onError(new Error('AgentEngineLoop is not configured'));
			return;
		}
		await this.agentEngineLoop.execute(messages, { ...options, mode: 'agent' }, callbacks);
	}

	async generateConversationTitle(
			messages: Message[],
			promptTemplate: string,
			modelId: string
		): Promise<string | null> {
			const config = this.findLLMConfig(modelId);
			if (!config) return null;
			const provider = ProviderFactory.createProvider(config);
			const conversationText = messages
				.map(m => `${m.role}: ${m.content.substring(0, 200)}`)
				.join('\n\n');
			const prompt = promptTemplate.replace('{conversation}', conversationText);
			const response = await provider.chat({
				messages: [{ role: 'user', content: prompt }],
				model: modelId,
				temperature: 0.3
			});
			const title = response.content.trim().replace(/^["']|["']$/g, '').replace(/^Title:\s*/i, '');
			return (title.length > 0 && title.length <= 100) ? title : null;
		}

		async generateConversationIcon(
			title: string,
			modelId: string
		): Promise<string | null> {
			const config = this.findLLMConfig(modelId);
			if (!config) return null;
			const provider = ProviderFactory.createProvider(config);
			const response = await provider.chat({
				messages: [{
					role: 'user',
					content: `Suggest a single emoji icon that represents this conversation: "${title}". Reply with only the emoji, no text.`
				}],
				model: modelId,
				temperature: 0.5
			});
			return response.content.trim().match(/[\p{Emoji}]/u)?.[0] ?? null;
		}
}
