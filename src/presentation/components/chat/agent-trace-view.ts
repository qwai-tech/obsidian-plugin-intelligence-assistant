import type { Message } from '@/types';
import type { AgentExecutionStep } from '@/presentation/state/chat-view-state';
import { createAgentExecutionTraceContainer, updateExecutionTrace, collapseExecutionTrace } from '@/presentation/components/chat/handlers/tool-call-handler';

export function renderLiveTrace(container: HTMLElement, steps: Message['agentExecutionSteps']): void {
	container.empty();
	renderExecutionTrace(container, steps);
}

export function renderExecutionTrace(
	container: HTMLElement,
	steps: Message['agentExecutionSteps'],
	reasoningContent?: string,
	reasoningSteps?: Message['reasoningSteps'],
): void {
	const finalThought = (content: string): AgentExecutionStep => ({ type: 'thought', content, timestamp: Date.now(), phase: 'final' });
	const allSteps: AgentExecutionStep[] = [
		...((steps ?? []) as unknown as AgentExecutionStep[]),
		...(reasoningContent ? [finalThought(reasoningContent)] : []),
		...(reasoningSteps ?? []).map(step => finalThought(`${step.description}\n\n${step.content}`)),
	];
	if (allSteps.length === 0) return;

	const traceContentEl = createAgentExecutionTraceContainer(container, allSteps.length);
	updateExecutionTrace(traceContentEl, allSteps);
	collapseExecutionTrace(traceContentEl);
}
