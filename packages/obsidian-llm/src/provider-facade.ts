import type { ChatRequest, ILLMProvider, LLMConfig, TokenUsage } from './types';
import { CompletionError } from './completion-status';
import { boundChatRequest } from './request-budget';

export interface LLMRequestEvent {
	id: string;
	model: string;
	provider: string;
	connectionId?: string;
	conversationId?: string;
	purpose?: string;
	operation: 'chat' | 'stream' | 'embedding';
	status: 'completed' | 'aborted' | 'failed';
	durationMs: number;
	usage?: TokenUsage;
}
type Observer = (event: LLMRequestEvent) => void | Promise<void>;
let observer: Observer | undefined;
export function setLLMRequestObserver(next: Observer): () => void { observer = next; return () => { if (observer === next) observer = undefined; }; }
async function publish(event: LLMRequestEvent): Promise<void> {
	try { await observer?.(event); } catch (error) { console.error('[LLM] Request accounting could not be persisted:', error); }
}

/** No concrete provider, credentials, transport, or mutable model cache escapes this closure. */
export function providerFacade(provider: ILLMProvider, identity: Pick<LLMConfig, 'provider' | 'id'>): ILLMProvider {
	const track = async <T>(operation: LLMRequestEvent['operation'], request: Pick<ChatRequest, 'model' | 'signal' | 'conversationId' | 'purpose'>, work: (usage: (value: TokenUsage) => void) => Promise<T>): Promise<T> => {
		const start = Date.now();
		let usage: TokenUsage | undefined;
		let status: LLMRequestEvent['status'] = 'completed';
		try { request.signal?.throwIfAborted(); return await work(value => { usage = value; }); }
		catch (error) { if (error instanceof CompletionError && error.usage) usage = error.usage; status = request.signal?.aborted ? 'aborted' : 'failed'; throw error; }
		finally { if (request.signal?.aborted) status = 'aborted'; await publish({ id: crypto.randomUUID(), provider: identity.provider, connectionId: identity.id, model: request.model, conversationId: request.conversationId, purpose: request.purpose, operation, status, durationMs: Date.now() - start, usage }); }
	};
	const facade: ILLMProvider = {
		name: provider.name,
		version: provider.version,
		capabilities: provider.capabilities ? Object.freeze({ ...provider.capabilities }) : undefined,
		async chat(request) { return track('chat', request, async record => { const response = await provider.chat(boundChatRequest(request)); if (response.usage) record(response.usage); return response; }); },
		async streamChat(request, onChunk) {
			await track('stream', request, async record => { await provider.streamChat(boundChatRequest(request), chunk => { if (chunk.usage) record(chunk.usage); onChunk(chunk); }); });
		},
	};
	if (provider.generateEmbedding) facade.generateEmbedding = (text, model, options) => track('embedding', { model, signal: options?.signal, purpose: 'embedding' }, () => provider.generateEmbedding!(text, model, options));
	return Object.freeze(facade);
}
