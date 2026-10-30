import { setIcon } from 'obsidian';
import type { AgentExecutionStep } from '@/features/llm';
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
	setIcon(titleRow.createSpan('agent-tool-call__chevron'), 'chevron-down');

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
	setIcon(header.createSpan('agent-collapsible-section__chevron'), 'chevron-down');

	const body = section.createDiv('agent-collapsible-section__body');
	if (isError) body.addClass('agent-collapsible-section__body--error');
	if (bodyTestId) body.setAttribute('data-testid', bodyTestId);

	const collapse = () => { body.addClass('ia-hidden'); section.addClass('is-collapsed'); };
	const expand = () => { body.classList.remove('ia-hidden'); section.removeClass('is-collapsed'); };

	body.setText(content);
	if (startExpanded) { expand(); } else { collapse(); }

	header.addEventListener('click', () => {
		if (body.classList.contains('ia-hidden')) { expand(); } else { collapse(); }
	});
}

/**
 * Creates a collapsible "Execution Process" container
 */
export function createAgentExecutionTraceContainer(messageBody: HTMLElement, summary: string): HTMLElement {
	const traceContainer = messageBody.createDiv('agent-execution-trace-container');
	traceContainer.addClass('ia-agent-trace-container');
	traceContainer.setAttribute('data-testid', TestIds.chat.agentTrace);

	const header = traceContainer.createDiv('agent-execution-trace-header');
	header.addClass('ia-agent-trace-header');

	setIcon(header.createSpan('agent-trace-icon'), 'chevron-down');
	header.createSpan({ cls: 'agent-trace-title', text: t('chat.toolCall.executionProcess') });
	if (summary) {
		header.createSpan({ cls: 'agent-trace-summary', text: summary });
	}

	const content = traceContainer.createDiv('agent-execution-trace-content');

	header.addEventListener('click', () => {
		const collapsed = !content.classList.contains('ia-hidden');
		content.classList.toggle('ia-hidden', collapsed);
		traceContainer.classList.toggle('is-collapsed', collapsed);
	});

	return content;
}

/**
 * Collapse the execution trace (called when agent finishes)
 */
export function collapseExecutionTrace(contentEl: HTMLElement): void {
	contentEl.classList.add('ia-hidden');
	contentEl.parentElement?.classList.add('is-collapsed');
}
