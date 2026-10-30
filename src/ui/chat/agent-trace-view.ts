import type { Message } from '@/features/conversations';
import { t } from '@/i18n';
import type { AgentExecutionStep } from '@/ui/state/chat-view-state';
import { createAgentExecutionTraceContainer, updateExecutionTrace, collapseExecutionTrace } from '@/ui/chat/handlers/tool-call-handler';

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

	const traceContentEl = createAgentExecutionTraceContainer(container, toolSummary(allSteps));
	updateExecutionTrace(traceContentEl, allSteps);
	collapseExecutionTrace(traceContentEl);
}

export function toolSummary(steps: AgentExecutionStep[]): string {
	const tools = steps.filter(step => step.type === 'action').map(step => step.content.split('(')[0].trim()).filter(Boolean);
	if (tools.length === 0) return '';
	return t('chat.toolCall.summary', { count: tools.length, tools: [...new Set(tools)].join(', ') });
}
