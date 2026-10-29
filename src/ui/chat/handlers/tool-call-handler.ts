import type { Message } from '@/features/conversations';
import type { AgentExecutionStep } from '@/ui/state/chat-view-state';
import { t } from '@/i18n';
import { TestIds } from '@/ui/utils/test-ids';

/**
 * Updates the execution trace display with current steps
 * Renders Thinking blocks and Tool Call cards with collapsible Input/Output
 */
export function updateExecutionTrace(container: HTMLElement, steps: AgentExecutionStep[]): void {
	container.empty();

	for (let i = 0; i < steps.length; i++) {
		const step = steps[i];

		if (step.type === 'thought' || step.type === 'response') {
			renderThinkingBlock(container, step.content, step.phase);
		} else if (step.type === 'action') {
			// New format: result stored on the action step itself
			// Old format: paired with the following observation step
			const hasInlineResult = step.result !== undefined;
			const observation = (!hasInlineResult && i + 1 < steps.length && steps[i + 1].type === 'observation')
				? steps[++i] : null;
			renderToolCallCard(container, step, observation);
		}
		// Standalone observations (without a preceding action) are skipped
	}
}

function renderThinkingBlock(container: HTMLElement, content: string, phase?: AgentExecutionStep['phase']): void {
	const block = container.createDiv('agent-thinking-block');
	if (phase) {
		block.setAttr('data-phase', phase);
	}
	// No icon / "Thinking<Phase>" label — render the model's reasoning as a plain
	// muted block. The chrome (brain badge + phase tag) was visual noise.
	const contentEl = block.createDiv('agent-thinking-block__content');
	contentEl.setText(content);
}

function renderToolCallCard(container: HTMLElement, actionStep: AgentExecutionStep, legacyObservation: AgentExecutionStep | null): void {
	// Resolve tool name and args — prefer structured fields, fall back to string parsing
	let toolName: string;
	let argsStr: string;

	if (actionStep.toolName) {
		toolName = actionStep.toolName;
		argsStr = actionStep.args ? JSON.stringify(actionStep.args, null, 2) : '';
	} else {
		const match = actionStep.content.match(/^([\w]+)\(([\s\S]*)\)$/);
		toolName = match ? match[1] : actionStep.content;
		argsStr = match ? match[2] : '';
		try {
			const parsed: unknown = JSON.parse(argsStr);
			argsStr = JSON.stringify(parsed, null, 2);
		} catch { /* keep as-is */ }
	}

	// Resolve result — prefer inline, fall back to legacy observation
	const resultContent = actionStep.result ?? legacyObservation?.content ?? null;
	const isError = actionStep.status === 'error' || legacyObservation?.status === 'error';
	const isPending = actionStep.status === 'pending';

	// Thinking bubble before the card
	if (actionStep.thinking) {
		renderThinkingBlock(container, actionStep.thinking, actionStep.phase);
	}

	const statusClass = isError ? 'is-error' : isPending ? 'is-pending' : 'is-success';
	const card = container.createDiv('agent-tool-call-card');
	card.addClass(statusClass);
	if (actionStep.phase) {
		card.setAttr('data-phase', actionStep.phase);
	}
	card.setAttribute('data-testid', TestIds.chat.agentTraceToolCard);

	// Title row: status dot + tool name + status text
	const titleRow = card.createDiv('agent-tool-call__title');
	const dot = titleRow.createSpan('agent-tool-call__status-dot');
	dot.setText(isError ? '✕' : isPending ? '◌' : '✓');
	
	const nameEl = titleRow.createSpan('agent-tool-call__name');
	nameEl.setText(toolName);
	nameEl.setAttribute('data-testid', TestIds.chat.agentTraceToolName);
	
	const phaseLabel: string | null = null; // phase tag removed (visual noise)
	if (phaseLabel) {
		titleRow.createSpan('agent-phase-badge').setText(phaseLabel);
	}

	if (isPending) {
		const spinner = titleRow.createSpan('agent-tool-call__spinner');
		spinner.setText(t('chat.toolCall.running'));
	}

	// Expand/Collapse Chevron
	const chevron = titleRow.createSpan('agent-tool-call__chevron');
	chevron.setText('▼');

	// Details container (hidden by default)
	const details = card.createDiv('agent-tool-call__details');

	// Input section — collapsible
	if (argsStr && argsStr !== '{}') {
		renderCollapsibleSection(details, t('chat.toolCall.input'), argsStr, false, false);
	}

	// Output section — collapsible
	if (resultContent !== null) {
		renderCollapsibleSection(details, t('chat.toolCall.output'), resultContent, isError, isError, TestIds.chat.agentTraceToolOutput);
	}

	// Click to toggle expansion
	card.addEventListener('click', (e) => {
		// Don't toggle if clicking inside an already expanded section or its headers
		if ((e.target as HTMLElement).closest('.agent-collapsible-section')) {
			return;
		}
		card.classList.toggle('is-expanded');
	});
}

function renderCollapsibleSection(
	parent: HTMLElement,
	title: string,
	content: string,
	isError?: boolean,
	startExpanded?: boolean,
	bodyTestId?: string
): void {
	const section = parent.createDiv('agent-collapsible-section');

	const header = section.createDiv('agent-collapsible-section__header');
	header.createSpan().setText(title);
	const chevron = header.createSpan('agent-collapsible-section__chevron');

	const body = section.createDiv('agent-collapsible-section__body');
	if (isError) body.addClass('agent-collapsible-section__body--error');
	if (bodyTestId) body.setAttribute('data-testid', bodyTestId);

	const collapse = () => { body.addClass('ia-hidden'); chevron.setText('▶'); };
	const expand = () => { body.classList.remove('ia-hidden'); chevron.setText('▼'); };

	body.setText(content);
	if (startExpanded) { expand(); } else { collapse(); }

	header.addEventListener('click', () => {
		if (body.classList.contains('ia-hidden')) { expand(); } else { collapse(); }
	});
}

/**
 * Creates a collapsible "Execution Process" container
 */
export function createAgentExecutionTraceContainer(messageBody: HTMLElement, _stepCount: number): HTMLElement {
	const traceContainer = messageBody.createDiv('agent-execution-trace-container');
	traceContainer.addClass('ia-agent-trace-container');
	traceContainer.setAttribute('data-testid', TestIds.chat.agentTrace);

	const header = traceContainer.createDiv('agent-execution-trace-header');
	header.addClass('ia-agent-trace-header');

	const title = header.createSpan('agent-trace-title');
	title.setText(t('chat.toolCall.executionProcess'));

	const icon = header.createSpan('agent-trace-icon');
	icon.setText('▲');

	const content = traceContainer.createDiv('agent-execution-trace-content');

	// Toggle on click - reads DOM state so external collapse is synced
	header.addEventListener('click', () => {
		if (content.classList.contains('ia-hidden')) {
			content.classList.remove('ia-hidden');
			icon.setText('▲');
		} else {
			content.classList.add('ia-hidden');
			icon.setText('▼');
		}
	});

	return content;
}

/**
 * Collapse the execution trace (called when agent finishes)
 */
export function collapseExecutionTrace(contentEl: HTMLElement): void {
	contentEl.classList.add('ia-hidden');
	const traceRoot = contentEl.parentElement;
	if (traceRoot) {
		const icon = traceRoot.querySelector('.agent-trace-icon');
		if (icon) {
			icon.textContent = '▼';
		}
	}
}

/**
 * Returns true if the message content contains a JSON tool-call block.
 */
export function hasAgentToolCall(content: string): boolean {
	const regex = /```json\s*\n([\s\S]*?)\n```/g;
	let match;
	while ((match = regex.exec(content)) !== null) {
		try {
			const json = JSON.parse(match[1]) as Record<string, unknown>;
			const name = json.name ?? json.tool;
			if (name && typeof name === 'string') {
				return true;
			}
		} catch { /* not a tool-call block */ }
	}
	return false;
}

/**
 * Strip legacy JSON tool-call blocks from a message so only the plain-language content remains.
 * Used for backward-compatible rendering of old conversations.
 */
export function extractFinalContent(message: Message): string {
	return message.content.replace(/```json\s*\n[\s\S]*?\n```/g, '').trim();
}

/**
 * Reconstruct AgentExecutionStep[] from a sequence of legacy assistant + system
 * messages that contained JSON tool-call blocks.
 * Used for backward-compatible rendering of old conversations.
 */
export function reconstructAgentSteps(messages: Message[]): AgentExecutionStep[] {
	const steps: AgentExecutionStep[] = [];
	for (const msg of messages) {
		if (msg.role === 'system' && msg.content.startsWith('Tool ')) {
			const resultMatch = msg.content.match(/^Tool\s+\S+\s+result:\s*([\s\S]*)$/);
			const resultContent = resultMatch ? resultMatch[1] : msg.content;
			const isError = resultContent.startsWith('Error:') || resultContent.startsWith('Unknown error');
			steps.push({
				type: 'observation',
				content: resultContent,
				timestamp: Date.now(),
				status: isError ? 'error' : 'success'
			});
			continue;
		}

		const regex = /```json\s*\n([\s\S]*?)\n```/g;
		let match;
		while ((match = regex.exec(msg.content)) !== null) {
			try {
				const json = JSON.parse(match[1]) as Record<string, unknown>;
				const name = (json.name ?? json.tool) as string | undefined;
				if (name && typeof name === 'string') {
					const args = typeof json.arguments === 'object' && json.arguments !== null
						? json.arguments as Record<string, unknown>
						: {};
					steps.push({
						type: 'action',
						content: `${name}(${JSON.stringify(args)})`,
						timestamp: Date.now(),
						status: 'success'
					});
				}
			} catch { /* ignore malformed blocks */ }
		}
	}
	return steps;
}
