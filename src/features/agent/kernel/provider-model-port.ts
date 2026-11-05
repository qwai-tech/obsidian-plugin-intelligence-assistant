import type { ChatRequest, ILLMProvider } from '@/features/llm';
import type { KernelEvent } from '@/features/agent/types/agent-run';
import type { ModelPort, ModelTurn } from './turn-kernel';
import { parseToolArguments } from './json-utils';
import { AgentStatusText } from './agent-status-text';

export class ProviderModelPort implements ModelPort {
	constructor(private readonly provider: ILLMProvider) {}

	async turn(request: ChatRequest, emit: (event: KernelEvent) => void): Promise<ModelTurn> {
		const turn: ModelTurn = { text: '', reasoning: '', calls: [] };
		const display = new AgentStatusText();
		await this.provider.streamChat(request, (chunk) => {
			if (chunk.reasoning) {
				turn.reasoning += chunk.reasoning;
				emit({ type: 'reasoning_delta', text: chunk.reasoning });
			}
			if (chunk.content) {
				turn.text += chunk.content;
				const visible = display.push(chunk.content);
				if (visible) emit({ type: 'text_delta', text: visible });
			}
			for (const call of chunk.toolCalls ?? []) {
				turn.calls.push({ id: call.id, name: call.function.name, arguments: parseToolArguments(call.function.arguments) });
			}
			if (chunk.usage) {
				turn.usage = chunk.usage;
			}
		});
		const remaining = display.push('', true);
		if (remaining) emit({ type: 'text_delta', text: remaining });
		return turn;
	}
}
