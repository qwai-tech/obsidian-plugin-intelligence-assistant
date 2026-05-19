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
import type { ToolManager } from './tool-manager';
import type { ToolCall } from './types';
import type { RAGManager } from '@/infrastructure/rag-manager';
import type { WebSearchService } from './web-search-service';
import type { StreamChunk } from '@/types/common/llm';

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

export interface AgentLoopCallbacks {
	onChunk: (chunk: StreamChunk) => void;
	onToolCall: (toolName: string, args: Record<string, unknown>) => void;
	onToolResult: (toolName: string, success: boolean, output: string) => void;
	onThought: (thought: string) => void;
	onComplete: (finalMessage: Message) => void;
	onError: (error: Error) => void;
	onTokenUsage?: (step: number, cumulativeTokens: number, budget: number) => void;
	checkAbort?: () => boolean;
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
		private toolManager: ToolManager,
		private ragManager: RAGManager,
		private webSearchService: WebSearchService,
		private llmConfigs: LLMConfig[],
		private usageRepo?: { recordUsage: (r: {model:string;provider:string;promptTokens:number;completionTokens:number;totalTokens:number;timestamp:number;conversationId?:string}) => Promise<void> }
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
		for (const ref of references) {
			if (ref.type === 'file') {
				try {
					const content = await this.fileSystem.read(ref.path);
					llmContent += `\n### 📄 ${ref.path}\n\`\`\`\n${content}\n\`\`\`\n`;
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

			// 1. Agent Mode: Tools system prompt
			if (options.mode === 'agent') {
				const toolsList = this.toolManager.getAllTools().map(tool =>
					`- ${tool.definition.name}: ${tool.definition.description}`
				).join('\n');

				systemMessages.push({
					role: 'system',
					content: `You are an AI agent with access to tools.\n\nAvailable tools:\n${toolsList}\n\nTo call a tool, use JSON block format.`
				});
			}

			// 2. Handle RAG
			let ragSources: RAGSource[] = [];
			if (options.enableRAG) {
				const searchResults = await this.ragManager.query(userQuery);
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
			allowOpenApiTools?: boolean;
		},
		callbacks: AgentLoopCallbacks
	): Promise<void> {
		const { model: selectedModel } = options;
		const config = ModelManager.findConfigForModelByProvider(selectedModel, this.llmConfigs);
		if (!config) {
			callbacks.onError(new Error(`No provider configuration found for model: ${selectedModel}`));
			return;
		}

		const provider = ProviderFactory.createProvider(config);
		const activeAgent = options.agentId
			? (options.agents ?? []).find(a => a.id === options.agentId)
			: undefined;
		const contextWindow = options.contextWindow ?? activeAgent?.contextWindow ?? 20;
		const reactEnabled = activeAgent?.reactEnabled ?? true;

		// Build agent system prompt (once, reused across loop iterations)
		const agentSystemMessages = this.buildAgentSystemMessages(
			options.isGenericAgent ?? !options.agentId,
			activeAgent,
			options.allowOpenApiTools ?? false
		);

		// Inject RAG + Web Search on first call only
		const userQuery = messages[messages.length - 1]?.content || '';
		const ragSources: RAGSource[] = [];
		const webResults: WebSearchResult[] = [];

		if (options.enableRAG) {
			const searchResults = await this.ragManager.query(userQuery);
			if (searchResults && searchResults.length > 0) {
				for (const r of searchResults) {
					ragSources.push({
						path: r.chunk.metadata.path,
						content: r.chunk.content,
						similarity: r.similarity,
						title: r.chunk.metadata.title
					});
				}
				const ragContext = ragSources.map(s => `Document: ${s.path}\nContent: ${s.content}`).join('\n\n');
				agentSystemMessages.push({ role: 'system', content: `RAG Context (retrieved from your vault):\n\n${ragContext}` });
			}
		}

		if (options.enableWebSearch) {
			const results = await this.webSearchService.search(userQuery);
			if (results && results.length > 0) {
				webResults.push(...results);
				const webContext = this.webSearchService.formatResultsAsContext(results);
				agentSystemMessages.push({ role: 'system', content: webContext });
			}
		}

		// Active system prompts
		const baseSystemMessages: Message[] = [
			...(options.activeSystemPrompts || []),
			...agentSystemMessages
		];

		const MAX_AGENT_STEPS = activeAgent?.reactMaxSteps ?? 10;
		const MAX_CONSECUTIVE_FAILURES = 3;
		const workingMessages = [...messages];
		const consecutiveFailures = new Map<string, number>();
		const tokenBudget = options.tokenBudget ?? 100000;
		let cumulativeTokens = 0;
		let lastStepUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null;
		let finalContent = '';

		try {
			for (let step = 0; step < MAX_AGENT_STEPS; step++) {
				if (callbacks.checkAbort?.()) break;

				// Deduplicate and apply context window
				const deduped = deduplicateMessages(workingMessages);
				const truncated = deduped.length > contextWindow
					? deduped.slice(-contextWindow)
					: deduped;
				const allMessages = [...baseSystemMessages, ...truncated];

				// Build native function calling tools
				const nativeTools = this.toolManager.toOpenAIFunctions();
				const streamToolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];

				// Per-step usage capture via object wrapper: TypeScript 5.9 narrows
				// callback-assigned let vars to their initial value; object properties avoid this.
				const stepCapture = { usage: null as { promptTokens: number; completionTokens: number; totalTokens: number } | null };

				// Stream LLM call
				finalContent = '';
				await provider.streamChat(
					{
						messages: allMessages,
						model: selectedModel,
						temperature: options.temperature,
						maxTokens: options.maxTokens,
						topP: options.topP,
						frequencyPenalty: options.frequencyPenalty,
						presencePenalty: options.presencePenalty,
						tools: nativeTools.length > 0 ? nativeTools : undefined,
						toolChoice: nativeTools.length > 0 ? 'auto' : undefined
					},
					(chunk) => {
						if (callbacks.checkAbort?.()) return;
						if (chunk.content) {
							finalContent += chunk.content;
							callbacks.onChunk(chunk);
						}
						if (chunk.usage) {
							stepCapture.usage = chunk.usage;
						}
						if (chunk.toolCalls) {
							for (const tc of chunk.toolCalls) {
								try {
									streamToolCalls.push({
										name: tc.function.name,
										arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>
									});
								} catch {
									streamToolCalls.push({ name: tc.function.name, arguments: {} });
								}
							}
						}
					}
				);

				const stepUsage = stepCapture.usage;

				if (callbacks.checkAbort?.()) break;

				// Track token usage from provider
				if (stepUsage) {
					cumulativeTokens += stepUsage.totalTokens;
				} else {
					cumulativeTokens += Math.ceil(((finalContent?.length ?? 0) + (baseSystemMessages.reduce((s, m) => s + (m.content?.length ?? 0), 0))) / 4);
				}
				if (this.usageRepo && stepUsage) {
					void this.usageRepo.recordUsage({
						model: selectedModel,
						provider: config.provider,
						promptTokens: stepUsage.promptTokens,
						completionTokens: stepUsage.completionTokens,
						totalTokens: stepUsage.totalTokens,
						timestamp: Date.now(),
						conversationId: options.conversationId
					});
				}
				lastStepUsage = stepUsage;
				callbacks.onTokenUsage?.(step, cumulativeTokens, tokenBudget);
				if (cumulativeTokens > tokenBudget) {
					const msg = `Token budget exceeded: ${cumulativeTokens} > ${tokenBudget}. Terminating agent loop.`;
					callbacks.onError(new Error(msg));
					return;
				}

				// Parse tool calls: prefer native, fall back to text parsing
			if (!reactEnabled) {
			callbacks.onComplete({
				role: 'assistant', content: finalContent, model: selectedModel,
				ragSources: ragSources.length > 0 ? ragSources : undefined,
				webSearchResults: webResults.length > 0 ? webResults : undefined,
				tokenUsage: lastStepUsage ?? undefined
			} as Message);
			return;
		}

		// Extract thought from ReAct pattern
		const thoughtMatch = finalContent.match(/Thought:\s*([\s\S]*?)(?=Action:|```|$)/i);
		if (thoughtMatch?.[1]?.trim()) {
			callbacks.onThought(thoughtMatch[1].trim());
		}
				const toolCalls = streamToolCalls.length > 0
					? streamToolCalls
					: this.parseToolCallsFromContent(finalContent);
				if (toolCalls.length === 0) break;

				let anyToolExecuted = false;
				// Push assistant message once for all tool calls in this response
				workingMessages.push({
					role: 'assistant',
					content: finalContent,
					model: selectedModel
				} as Message);

				for (const toolCall of toolCalls) {
					if (callbacks.checkAbort?.()) break;

					callbacks.onToolCall(toolCall.name, toolCall.arguments);

					// Check tool permissions
					const toolAllowed = this.isToolAllowed(toolCall.name, activeAgent, options.allowOpenApiTools ?? false);
					let result: { success: boolean; result?: unknown; error?: string };

					if (!toolAllowed) {
						result = { success: false, error: `Tool ${toolCall.name} is not enabled for this agent` };
					} else {
						try {
							const execResult = await this.toolManager.executeTool(toolCall);
							result = { success: execResult.success, result: execResult.result, error: execResult.error };
						} catch (err) {
							result = { success: false, error: err instanceof Error ? err.message : String(err) };
						}
					}

					// Track consecutive failures
					if (result.success) {
						consecutiveFailures.delete(toolCall.name);
					} else {
						const fails = (consecutiveFailures.get(toolCall.name) || 0) + 1;
						consecutiveFailures.set(toolCall.name, fails);
						if (fails >= MAX_CONSECUTIVE_FAILURES) {
							const msg = `Tool "${toolCall.name}" failed ${fails} consecutive times. Terminating agent loop.`;
							callbacks.onToolResult(toolCall.name, false, msg);
							callbacks.onError(new Error(msg));
							return;
						}
					}

					// Structured diagnosis for failures
					const output = result.success
						? JSON.stringify(result.result)
						: this.diagnoseToolError(toolCall.name, toolCall.arguments, result.error ?? 'Unknown error');

					callbacks.onToolResult(toolCall.name, result.success, output);

					// Add tool result to working messages for next iteration
					workingMessages.push({
						role: 'system',
						content: `Tool ${toolCall.name} result: ${output}`
					} as Message);

					anyToolExecuted = true;
				}

				if (!anyToolExecuted) break;
			}

			const assistantMessage: Message = {
				role: 'assistant',
				content: finalContent,
				model: selectedModel,
				ragSources: ragSources.length > 0 ? ragSources : undefined,
				webSearchResults: webResults.length > 0 ? webResults : undefined,
				tokenUsage: lastStepUsage ?? undefined
			};

			callbacks.onComplete(assistantMessage);
		} catch (error) {
			callbacks.onError(error instanceof Error ? error : new Error(String(error)));
		}
	}

	private buildAgentSystemMessages(
		isGenericAgent: boolean,
		activeAgent?: Agent,
		allowOpenApiTools?: boolean
	): Message[] {
		const messages: Message[] = [];

		if (isGenericAgent) {
			const toolsList = this.toolManager.getAllTools().map(tool =>
				`- ${tool.definition.name}: ${tool.definition.description}`
			).join('\n');

			messages.push({
				role: 'system',
				content: `You are a ReAct (Reasoning + Action) agent. You think step-by-step and take actions when needed to solve user queries.

Follow this ReAct pattern strictly:
Thought: First, think about what you need to do to solve the query
Action: Then, call a tool if needed with the proper arguments
Observation: You will receive the result of your action
Repeat: Continue thinking, acting, and observing until you can provide a final answer

Available tools:
${toolsList}

To call a tool, respond with a JSON block in this format:
\`\`\`json
{
  "name": "tool_name",
  "arguments": {
    "arg1": "value1",
    "arg2": "value2"
  }
}
\`\`\`

Always think before you act. Only call one tool at a time. After receiving the result, think about what to do next.`
			});
		} else {
			const toolsList = this.toolManager.getAllTools().filter(tool => {
				if (!activeAgent) return true;
				if (tool.provider === 'built-in') return true;
				if (tool.provider?.startsWith('mcp:')) {
					const serverName = tool.provider.substring(4);
					if (activeAgent.enabledMcpServers.includes(serverName)) return true;
					const fullKey = `${serverName}::${tool.definition.name}`;
					return activeAgent.enabledMcpTools?.includes(fullKey) ?? false;
				}
				if (tool.provider?.startsWith('cli:')) {
					if (activeAgent.enabledAllCLITools) return true;
					const toolId = tool.provider.substring(4);
					return activeAgent.enabledCLITools?.includes(toolId) ?? false;
				}
				if (tool.provider?.startsWith('openapi:')) {
					return allowOpenApiTools ?? false;
				}
				return true;
			}).map(tool => `- ${tool.definition.name}: ${tool.definition.description}`).join('\n');

			messages.push({
				role: 'system',
				content: `You are an AI agent with access to tools. You can call tools to help answer the user's questions.

Available tools:
${toolsList}

To call a tool, respond with a JSON block in this format:
\`\`\`json
{
  "name": "tool_name",
  "arguments": {
    "arg1": "value1",
    "arg2": "value2"
  }
}
\`\`\`

After calling a tool, you will receive the result and can continue the conversation or call another tool if needed.`
			});
		}

		return messages;
	}

	private parseToolCallsFromContent(content: string): ToolCall[] {
		const toolCalls: ToolCall[] = [];
		const regex = /```json\s*\n([\s\S]*?)\n```/g;
		let match;
		while ((match = regex.exec(content)) !== null) {
			try {
				const json = JSON.parse(match[1]) as { name?: unknown; tool?: unknown; arguments?: unknown };
				const toolName = json.name ?? json.tool;
				if (!toolName || typeof toolName !== 'string') continue;
				toolCalls.push({
					name: toolName,
					arguments: typeof json.arguments === 'object' && json.arguments !== null
						? (json.arguments as Record<string, unknown>)
						: {}
				});
			} catch { /* not a tool-call block */ }
		}
		return toolCalls;
	}

	private isToolAllowed(
		toolName: string,
		agent?: Agent,
		allowOpenApiTools?: boolean
	): boolean {
		if (!agent) return true;

		const tool = this.toolManager.getTool(toolName);
		if (!tool) return false;

		if (tool.provider?.startsWith('mcp:')) {
			const serverName = tool.provider.substring(4);
			const fullToolKey = `${serverName}::${toolName}`;
			if (agent.enabledMcpTools?.includes(fullToolKey)) return true;
			return agent.enabledMcpServers.includes(serverName);
		}

		if (tool.provider?.startsWith('openapi:')) {
			return allowOpenApiTools ?? false;
		}

		if (tool.provider?.startsWith('cli:')) {
			if (agent.enabledAllCLITools) return true;
			const toolId = tool.provider.substring(4);
			return agent.enabledCLITools?.includes(toolId) ?? false;
		}

		return agent.enabledBuiltInTools.includes(toolName);
	}

	private diagnoseToolError(
		toolName: string,
		args: Record<string, unknown>,
		error: string
	): string {
		const suggestions: string[] = [];
		const argList = Object.entries(args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');

		// File tools
		if (toolName === 'read_file' || toolName === 'write_file' || toolName === 'append_to_note') {
			const path = typeof args.path === 'string' ? args.path : 'unknown';
			if (error.includes('not found') || error.includes('does not exist')) {
				suggestions.push(`Verify the file path is correct. Paths are relative to the vault root.`);
				suggestions.push(`Use list_files to browse available files before reading.`);
			}
			if (error.includes('Permission')) {
				suggestions.push(`The file is outside the vault boundary. Use paths within your vault only.`);
			}
		}

		if (toolName === 'write_file' || toolName === 'create_note') {
			if (error.includes('already exists')) {
				suggestions.push(`File already exists. Use append_to_note to add content, or choose a different name.`);
			}
		}

		// Search tools
		if (toolName === 'search_files') {
			if (error.includes('no results') || error.includes('not found')) {
				suggestions.push(`Try broader search terms or use list_files to browse available files.`);
				suggestions.push(`Enable search_content=true to search inside file contents.`);
			}
		}

		// MCP tools
		if (error.includes('not connected') || error.includes('disconnected')) {
			suggestions.push(`The MCP server for "${toolName}" is not connected. Check Settings → MCP to reconnect.`);
		}

		// CLI tools
		if (error.includes('timeout')) {
			suggestions.push(`The command timed out. Try reducing the scope or increasing the timeout in Tool settings.`);
		}
		if (error.includes('command not found') || error.includes('ENOENT')) {
			suggestions.push(`The command for "${toolName}" was not found. Verify it is installed and on your PATH.`);
		}

		// Generic fallback
		if (suggestions.length === 0) {
			suggestions.push(`Check the tool arguments (${argList}) and try again with corrected inputs.`);
			suggestions.push(`If the error persists, try a different approach or tool.`);
		}

		return [
			`Tool "${toolName}" failed: ${error}`,
			`Arguments: ${argList}`,
			'',
			'Suggestions:',
			...suggestions.map(s => `  • ${s}`)
		].join('\n');
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
