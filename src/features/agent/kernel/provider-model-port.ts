import type { ChatRequest, ILLMProvider } from '@/features/llm';
import type { KernelEvent } from '@/features/agent/types/agent-run';
import type { ModelPort, ModelTurn } from './turn-kernel';
import { parseToolArguments } from './json-utils';

export class ProviderModelPort implements ModelPort {
	constructor(private readonly provider: ILLMProvider) {}

	async turn(request: ChatRequest, emit: (event: KernelEvent) => void): Promise<ModelTurn> {
		const turn: ModelTurn = { text: '', reasoning: '', calls: [] };
		await this.provider.streamChat(request, (chunk) => {
			if (chunk.reasoning) {
				turn.reasoning += chunk.reasoning;
				emit({ type: 'reasoning_delta', text: chunk.reasoning });
			}
			if (chunk.content) {
				turn.text += chunk.content;
				emit({ type: 'text_delta', text: chunk.content });
			}
			for (const call of chunk.toolCalls ?? []) {
				turn.calls.push({ id: call.id, name: call.function.name, arguments: parseToolArguments(call.function.arguments) });
			}
			if (chunk.usage) {
				turn.usage = chunk.usage;
			}
		});
		return turn;
	}
}
