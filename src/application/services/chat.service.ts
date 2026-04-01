/**
 * Chat Service
 * Core business logic for AI chat, coordinating RAG, Web Search, and LLM Providers.
 */

import type { App, TFile, TFolder } from 'obsidian';
import type { 
	Message, 
	LLMConfig, 
	RAGSource, 
	WebSearchResult, 
	FileReference 
} from '@/types';
import { ProviderFactory } from '@/infrastructure/llm/provider-factory';
import { ModelManager } from '@/infrastructure/llm/model-manager';
import type { ToolManager } from './tool-manager';
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
}

export class ChatService {
	constructor(
		private app: App,
		private toolManager: ToolManager,
		private ragManager: RAGManager,
		private webSearchService: WebSearchService,
		private llmConfigs: LLMConfig[]
	) {}

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
		referenceInputs: (TFile | TFolder | FileReference)[] = []
	): Promise<{ llmContent: string; references: FileReference[] }> {
		if (!referenceInputs || referenceInputs.length === 0) {
			return { llmContent: text, references: [] };
		}

		const references: FileReference[] = referenceInputs.map(item => {
			if (item instanceof (this.app.vault.getAbstractFileByPath('') as any).constructor && (item as any).extension !== undefined) {
				return { type: 'file', path: (item as TFile).path, name: (item as TFile).name };
			}
			if (item instanceof (this.app.vault.getAbstractFileByPath('') as any).constructor && (item as any).children !== undefined) {
				return { type: 'folder', path: (item as TFolder).path, name: (item as TFolder).name };
			}
			return item as FileReference;
		});

		let llmContent = text + '\n\n---\n**Referenced Files/Folders:**\n\n';
		for (const ref of references) {
			if (ref.type === 'file') {
				const file = this.app.vault.getAbstractFileByPath(ref.path);
				if (file instanceof (this.app.vault.getAbstractFileByPath('') as any).constructor) {
					try {
						const content = await this.app.vault.read(file as TFile);
						llmContent += `\n### 📄 ${ref.path}\n\`\`\`\n${content}\n\`\`\`\n`;
					} catch (error) {
						llmContent += `\n### 📄 ${ref.path}\n*Error reading file: ${String(error)}*\n`;
					}
				}
			} else {
				const folder = this.app.vault.getAbstractFileByPath(ref.path);
				if (folder instanceof (this.app.vault.getAbstractFileByPath('') as any).constructor) {
					llmContent += `\n### 📁 ${ref.path}\n(Referenced as context)\n`;
				}
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
			let fullContent = '';
			let fullReasoning = '';
			
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
					if (chunk.reasoning) {
						fullReasoning += chunk.reasoning;
						callbacks.onChunk(chunk);
					}
				}
			);

			// 6. Finalize Result
			const assistantMessage: Message = {
				role: 'assistant',
				content: fullContent,
				model: selectedModel,
				ragSources: ragSources.length > 0 ? ragSources : undefined,
				webSearchResults: webResults.length > 0 ? webResults : undefined,
				reasoningContent: fullReasoning || undefined
			};

			callbacks.onComplete(assistantMessage);

		} catch (error) {
			callbacks.onError(error instanceof Error ? error : new Error(String(error)));
		}
	}
}
