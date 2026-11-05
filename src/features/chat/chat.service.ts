/**
 * Chat Service
 * Core business logic for AI chat, coordinating RAG, Web Search, and LLM Providers.
 */

import type { Message } from '@/features/conversations';
import type { LLMConfig, StreamChunk } from '@/features/llm';
import type { RAGSource, KnowledgeBase } from '@/features/knowledge';
import type { WebSearchResult, WebSearchService } from '@/features/web-search';
import type { FileReference } from '@/features/chat/types/attachments';
import type { Agent, AgentEngineLoop, AgentLoopCallbacks, TaskAuthorization } from '@/features/agent';
import { RunCoordinator, resolveAgentTask, taskCheckpointContext } from '@/features/agent';
import { IFileSystem } from '@/core/interfaces/file-system.interface';
import { ProviderFactory } from '@qwai/obsidian-llm';
import { ModelManager } from '@qwai/obsidian-llm';
import type { UsageRecord } from '@/features/usage';
import { savedExecutionBoundary, savedExecutionContext } from './saved-execution-context';

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
	/** Original user input; never enriched vault/attachment content. */
	userText?: string;
	authorization?: TaskAuthorization;
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

export interface ModelSettings {
	llmConfigs: LLMConfig[];
	defaultModel?: string;
}

export interface UsageRecorder {
	recordUsage(record: UsageRecord): Promise<void>;
}

export interface ChatCallbacks {
	onChunk: (chunk: StreamChunk) => void;
	onComplete: (finalMessage: Message) => void;
	onError: (error: Error) => void;
	onRAGSources?: (sources: RAGSource[]) => void;
	onWebSearch?: (results: WebSearchResult[]) => void;
	signal?: AbortSignal;
}
export interface ChatServiceDependencies {
	runs?: RunCoordinator;
	fileSystem: IFileSystem;
	knowledge: KnowledgeBase;
	webSearchService: WebSearchService;
	settings: () => ModelSettings;
	usageRepo?: UsageRecorder;
	agentEngineLoop?: AgentEngineLoop;
}

export class ChatService {
	private readonly runs: RunCoordinator;
	private readonly fileSystem: IFileSystem;
	private readonly knowledge: KnowledgeBase;
	private readonly webSearchService: WebSearchService;
	private readonly settings: () => ModelSettings;
	private readonly agentEngineLoop?: AgentEngineLoop;

	constructor(dependencies: ChatServiceDependencies) {
		this.runs = dependencies.runs ?? new RunCoordinator();
		this.fileSystem = dependencies.fileSystem;
		this.knowledge = dependencies.knowledge;
		this.webSearchService = dependencies.webSearchService;
		this.settings = dependencies.settings;
		this.agentEngineLoop = dependencies.agentEngineLoop;
	}

	findLLMConfig(modelId: string): LLMConfig | null {
		return ModelManager.findConfigForModelByProvider(modelId, this.settings().llmConfigs);
	}

	/**
	 * Prepare messages for LLM, including formatting attachments and applying context window
	 */
	public prepareLlmMessages(
		allMessages: Message[], 
		targetMessage: Message, 
		llmContent: string, 
		contextWindow = 20,
		agentMode = false
	): Message[] {
		const targetIndex = allMessages.indexOf(targetMessage);
		const task = agentMode ? resolveAgentTask(allMessages, targetMessage) : undefined;
		if (task) targetMessage.agentTask = task;
		
		const formattedMessages = allMessages.map((msg, index) => {
			const isTarget = index === targetIndex;
			const baseContent = isTarget ? llmContent : msg.content;
			const reasoning = msg.role === 'assistant' && msg.reasoningContent !== undefined ? { reasoningContent: msg.reasoningContent } : {};

			if (!msg.attachments || msg.attachments.length === 0) {
				return { role: msg.role, content: baseContent, ...(isTarget && task ? { agentTask: task } : {}), ...reasoning };
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

			const imageAttachments = msg.attachments.filter(att => att.type === 'image');
			if (imageAttachments.length === 0) {
				return { role: msg.role, content: finalContent, ...(isTarget && task ? { agentTask: task } : {}), ...reasoning };
			}
			finalContent += '\n\n---\n**Attached Images:**\n\n';
			imageAttachments.forEach(att => {
				finalContent += `- Image: ${att.name} (Path: ${att.path})\n`;
			});
			return { role: msg.role, content: finalContent, attachments: imageAttachments, ...(isTarget && task ? { agentTask: task } : {}), ...reasoning };
		});

		// Repeated prompts are legitimate new turns (including retries). Keep
		// their chronological position rather than globally deduplicating text.
		const saved = savedExecutionContext(allMessages.slice(-contextWindow));
		const boundary = savedExecutionBoundary(allMessages.slice(-contextWindow));
		return [...(task ? [taskCheckpointContext(task)] : []), ...(boundary ? [task ? { ...boundary, context: true } : boundary] : []), ...(saved ? [saved] : []), ...formattedMessages.slice(-contextWindow)];
	}

	/**
	 * Build context from referenced files and folders
	 */
	async buildReferenceContext(
		text: string,
		references: FileReference[] = [],
		options: { embedContent?: boolean } = {}
	): Promise<{ llmContent: string; references: FileReference[] }> {
		const { embedContent = true } = options;
		if (!references || references.length === 0) {
			return { llmContent: text, references: [] };
		}

		// Agent mode expands reference CONTENT once via the sense service
		// ("Explicit references"); embedding it again in the message would double
		// the per-turn token cost. There, keep only the user text and pass the
		// references through for the sense path to inline.
		if (!embedContent) {
			return { llmContent: text, references };
		}

		let llmContent = text + '\n\n---\n**Referenced Files/Folders:**\n\n';
		let totalChars = 0;
		for (const path of await this.referencedNotePaths(references)) {
			const remaining = MAX_REFERENCE_TOTAL_CHARS - totalChars;
			if (remaining <= 0) {
				llmContent += `\n### 📄 ${path}\n*(omitted to stay within the reference budget — call read_file("${path}") if you need it)*\n`;
				continue;
			}
			try {
				const content = await this.fileSystem.read(path);
				const cap = Math.min(MAX_REFERENCE_CHARS_PER_FILE, remaining);
				const body = content.length > cap
					? `${content.slice(0, cap)}\n…[truncated ${content.length - cap} chars — call read_file("${path}") for the full note]`
					: content;
				totalChars += Math.min(content.length, cap);
				llmContent += `\n### 📄 ${path}\n\`\`\`\n${body}\n\`\`\`\n`;
			} catch (error) {
				llmContent += `\n### 📄 ${path}\n*Error reading file: ${String(error)}*\n`;
			}
		}

		return { llmContent, references };
	}

	private async referencedNotePaths(references: FileReference[]): Promise<string[]> {
		const paths = await Promise.all(references.map(async ref => ref.type === 'file'
			? [ref.path]
			: (await this.fileSystem.listRecursive(ref.path)).filter(path => path.endsWith('.md')).sort()));
		return [...new Set(paths.flat())];
	}

	/**
	 * Main chat execution loop (Streaming)
	 */
	streamResponse(messages: Message[], options: ChatOptions, callbacks: ChatCallbacks): Promise<void> {
		return this.runs.run(callbacks.signal, async lease => {
			await this.streamOwned(JSON.parse(JSON.stringify(messages)) as Message[], JSON.parse(JSON.stringify(options)) as ChatOptions, { ...callbacks, signal: lease.signal,
				onComplete: message => { lease.finish(lease.signal.aborted ? 'aborted' : 'completed'); callbacks.onComplete(message); },
				onError: error => { lease.finish(lease.signal.aborted ? 'aborted' : 'failed'); callbacks.onError(error); },
			});
		});
	}

	private async streamOwned(messages: Message[], options: ChatOptions, callbacks: ChatCallbacks): Promise<void> {
		try {
			const { model: selectedModel } = options;
			const config = ModelManager.findConfigForModelByProvider(selectedModel, this.settings().llmConfigs);
			
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
				ragSources = await this.knowledge.search(userQuery, selectedModel, this.settings().defaultModel, { memoryMode: 'none', signal: callbacks.signal });
				if (ragSources.length > 0) {
					
					const ragContext = ragSources
						.map(s => `Document: ${s.path}\nContent: ${s.content}`)
						.join('\n\n');
						
					systemMessages.push({
						role: 'system', context: true,
						content: `RAG Context (retrieved from your vault):\n\n${ragContext}`
					});
					
					if (callbacks.onRAGSources) callbacks.onRAGSources(ragSources);
				}
			}

			// 3. Handle Web Search
			let webResults: WebSearchResult[] = [];
			if (options.enableWebSearch) {
				webResults = await this.webSearchService.search(options.userText ?? '', { signal: callbacks.signal });
				if (webResults && webResults.length > 0) {
					const webContext = this.webSearchService.formatResultsAsContext(webResults);
					systemMessages.push({ role: 'system', context: true, content: webContext });
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

			try {
				await provider.streamChat(
					{
						messages: finalMessages,
						model: selectedModel, conversationId: options.conversationId, purpose: 'chat',
						temperature: options.temperature,
						maxTokens: options.maxTokens,
						topP: options.topP,
						frequencyPenalty: options.frequencyPenalty,
						presencePenalty: options.presencePenalty,
						signal: callbacks.signal,
					},
					(chunk) => {
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
					},
				);
			} catch (error) {
				if (!callbacks.signal?.aborted) {
					throw error;
				}
			}

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
