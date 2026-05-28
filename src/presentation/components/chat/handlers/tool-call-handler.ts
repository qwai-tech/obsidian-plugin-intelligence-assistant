/**
 * Tool Call Handler
 * Manages agent tool call parsing, execution, and trace rendering
 */

import type { Message } from '@/types';
import type { ToolCall } from '@/application/services/types';
import type { ToolRegistry } from '@/application/tools/tool-registry';
import type { Agent } from '@/types';
import type { AgentExecutionStep } from '@/presentation/state/chat-view-state';
import { t } from '@/i18n';

/**
 * Processes tool calls from agent response content.
 *
 * Permission gating now flows through `agent.toolAccess` via the registry's
 * resolveForAgent — the old per-source string-prefix branches (mcp:/openapi:/
 * cli:/builtin) are gone.
 */

export async function processToolCalls(
	content: string,
	messages: Message[],
	executionSteps: AgentExecutionStep[],
	toolRegistry: ToolRegistry,
	agent?: Agent, // Optional agent to check tool permissions against
	traceContainer?: HTMLElement,
	onContinue?: () => Promise<void>
): Promise<boolean> {
	// Extract JSON tool calls from content
	const jsonBlockRegex = /```json\s*\n([\s\S]*?)\n```/g;
	const matches = [...content.matchAll(jsonBlockRegex)];

	// Track if any tools were executed
	let toolsExecuted = false;
	const refreshTrace = () => {
		if (traceContainer) {
			updateExecutionTrace(traceContainer, executionSteps);
		}
	};

	// Extract thought from content (text before tool call)
	const thoughtMatch = content.match(/Thought:(.*?)(?:Action:|$)/s);
	if (thoughtMatch) {
		const thought = thoughtMatch[1].trim();
		if (thought) {
			executionSteps.push({
				type: 'thought',
				content: thought,
				timestamp: Date.now()
			});
			refreshTrace();
		}
	}

	for (const match of matches) {
		try {
			const json = JSON.parse(match[1]) as { name?: unknown; tool?: unknown; arguments?: unknown };

			// Handle both formats: { "name": "tool_name", "arguments": {...} } and { "tool": "tool_name", "arguments": {...} }
			const toolName = json.name ?? json.tool;
			if (!toolName || typeof toolName !== 'string') {
				console.debug('Skipping non-tool call JSON block:', json);
				continue;
			}

			// Ensure it has the right structure to be a ToolCall
			const toolCall: ToolCall = {
				name: toolName,
				arguments: typeof json.arguments === 'object' && json.arguments !== null ? (json.arguments as Record<string, unknown>) : {}
			};

			// Record action step
			const actionStep: AgentExecutionStep = {
				type: 'action',
				content: `${toolCall.name}(${JSON.stringify(toolCall.arguments)})`,
				timestamp: Date.now(),
				status: 'pending'
			};
			executionSteps.push(actionStep);
			refreshTrace();

			// Defense-in-depth: chat.service already filtered the tool list via
			// registry.resolveForAgent before sending it to the LLM, but the LLM
			// can still hallucinate a tool name. Re-check membership here.
			let toolAllowed = true;
			const registeredTool = toolRegistry.getToolByLlmName(toolCall.name);

			if (!registeredTool) {
				toolAllowed = false;
			} else if (agent) {
				const access = agent.toolAccess ?? { sources: {} };
				const allowed = toolRegistry.resolveForAgent(access);
				toolAllowed = allowed.some((t) => t.toolId === registeredTool.toolId);
			}

			let result;
			if (!toolAllowed) {
				result = {
					success: false,
					error: `Tool ${toolCall.name} is not enabled for this agent`
				};
			} else {
				result = await toolRegistry.executeTool(toolCall.name, toolCall.arguments);
			}

			actionStep.status = result.success ? 'success' : 'error';

			// Record observation step
			executionSteps.push({
				type: 'observation',
				content: result.success ? JSON.stringify(result.result, null, 2) : `Error: ${result.error ?? ''}`,
				timestamp: Date.now(),
				status: result.success ? 'success' : 'error'
			});

			refreshTrace();

			// Add tool result to messages for context
			messages.push({
				role: 'system',
				content: `Tool ${toolCall.name ?? ''} result: ${result.success ? JSON.stringify(result.result) : (result.error ?? 'Unknown error')}`
			} as Message);

			toolsExecuted = true;

		} catch (error) {
			console.error('Tool call parsing error:', error);
			executionSteps.push({
				type: 'observation',
				content: `Error: ${error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error)}`,
				timestamp: Date.now(),
				status: 'error'
			});
			refreshTrace();
		}
	}

	// If any tools were executed, continue the agent conversation with the new context
	if (toolsExecuted && onContinue) {
		// Add a small delay to allow UI to update
		await new Promise(resolve => activeWindow.setTimeout(resolve, 100));
		await onContinue();
	}

	return toolsExecuted;
}

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

function formatPhaseLabel(phase?: AgentExecutionStep['phase']): string | null {
	if (!phase) return null;
	return phase.charAt(0).toUpperCase() + phase.slice(1);
}

function renderThinkingBlock(container: HTMLElement, content: string, phase?: AgentExecutionStep['phase']): void {
	const block = container.createDiv('agent-thinking-block');

	const labelRow = block.createDiv('agent-thinking-block__label-row');
	labelRow.createSpan().setText('🧠');
	const label = labelRow.createSpan('agent-thinking-block__label');
	label.setText(t('chat.toolCall.thinking'));
	const phaseLabel = formatPhaseLabel(phase);
	if (phaseLabel) {
		labelRow.createSpan('agent-phase-badge').setText(phaseLabel);
	}

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
		} catch (_e) { /* keep as-is */ }
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

	// Title row: status dot + tool name + status text
	const titleRow = card.createDiv('agent-tool-call__title');
	const dot = titleRow.createSpan('agent-tool-call__status-dot');
	dot.setText(isError ? '✕' : isPending ? '◌' : '✓');
	const nameEl = titleRow.createSpan('agent-tool-call__name');
	nameEl.setText(toolName);
	const phaseLabel = formatPhaseLabel(actionStep.phase);
	if (phaseLabel) {
		titleRow.createSpan('agent-phase-badge').setText(phaseLabel);
	}
	if (isPending) {
		const spinner = titleRow.createSpan('agent-tool-call__spinner');
		spinner.setText(t('chat.toolCall.running'));
	}

	// Input section — collapsible, collapsed by default
	if (argsStr && argsStr !== '{}') {
		renderCollapsibleSection(card, t('chat.toolCall.input'), argsStr, false, false);
	}

	// Output section — collapsible, expanded by default on error, collapsed on success
	if (resultContent !== null) {
		renderCollapsibleSection(card, t('chat.toolCall.output'), resultContent, isError, isError);
	}
}

function renderCollapsibleSection(
	parent: HTMLElement,
	title: string,
	content: string,
	isError?: boolean,
	startExpanded?: boolean
): void {
	const section = parent.createDiv('agent-collapsible-section');

	const header = section.createDiv('agent-collapsible-section__header');
	header.createSpan().setText(title);
	const chevron = header.createSpan('agent-collapsible-section__chevron');

	const body = section.createDiv('agent-collapsible-section__body');
	if (isError) body.addClass('agent-collapsible-section__body--error');

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
