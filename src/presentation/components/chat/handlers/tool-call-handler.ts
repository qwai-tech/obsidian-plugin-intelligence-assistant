/**
 * Tool Call Handler
 * Manages agent tool call parsing, execution, and trace rendering
 */

import type { Message } from '@/types';
import type { ToolCall } from '@/application/services/types';
import type { ToolManager } from '@/application/services/tool-manager';
import type { Agent } from '@/types';
import type { AgentExecutionStep } from '@/presentation/state/chat-view-state';

/**
 * Processes tool calls from agent response content
 */
interface ToolCallOptions {
	allowOpenApiTools?: boolean;
}

export async function processToolCalls(
	content: string,
	messages: Message[],
	executionSteps: AgentExecutionStep[],
	toolManager: ToolManager,
	agent?: Agent, // Optional agent to check tool permissions against
	traceContainer?: HTMLElement,
	onContinue?: () => Promise<void>,
	options?: ToolCallOptions
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

			// Check if agent has this tool enabled (for agent-specific tool permissions)
			let toolAllowed = true;
			
			if (agent) {
				const tool = toolManager.getTool(toolCall.name);
				if (tool) {
					if (tool.provider && tool.provider.startsWith('mcp:')) {
						// This is an MCP tool - check agent's MCP tool permissions
						const serverName = tool.provider.substring(4); // Remove 'mcp:' prefix
						const fullToolKey = `${serverName ?? 'unknown'}::${toolCall.name ?? ''}`;
						
						// Check if this specific tool is enabled for the agent
						const hasSpecificToolEnabled = agent.enabledMcpTools?.includes(fullToolKey) || false;
						
						// Also check if the entire server is enabled for the agent
						const hasServerEnabled = agent.enabledMcpServers.includes(serverName);
						
						toolAllowed = hasSpecificToolEnabled || hasServerEnabled;
					} else if (tool.provider && tool.provider.startsWith('openapi:')) {
						toolAllowed = options?.allowOpenApiTools ?? false;
					} else if (tool.provider && tool.provider.startsWith('cli:')) {
						// This is a CLI tool - check agent's CLI tool permissions
						if (agent.enabledAllCLITools) {
							toolAllowed = true;
						} else {
							const toolId = tool.provider.substring(4); // Remove 'cli:' prefix
							toolAllowed = agent.enabledCLITools?.includes(toolId) ?? false;
						}
					} else {
						// For built-in tools, check if it's in enabledBuiltInTools
						toolAllowed = agent.enabledBuiltInTools.includes(toolCall.name);
					}
				} else {
					// Tool not found, so not allowed
					toolAllowed = false;
				}
			}

			let result;
			if (!toolAllowed) {
				result = {
					success: false,
					error: `Tool ${toolCall.name} is not enabled for this agent`
				};
			} else {
				result = await toolManager.executeTool(toolCall);
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
		await new Promise(resolve => setTimeout(resolve, 100));
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
			renderThinkingBlock(container, step);
		} else if (step.type === 'action') {
			// Pair action with the following observation (if present)
			const observation = (i + 1 < steps.length && steps[i + 1].type === 'observation')
				? steps[++i] : null;
			renderToolCallCard(container, step, observation);
		}
		// Standalone observations (without a preceding action) are skipped
	}
}

function renderThinkingBlock(container: HTMLElement, step: AgentExecutionStep): void {
	const block = container.createDiv('agent-thinking-block');

	const labelRow = block.createDiv('agent-thinking-block__label-row');
	labelRow.createSpan().setText('🧠');
	const label = labelRow.createSpan('agent-thinking-block__label');
	label.setText('Thinking');

	const contentEl = block.createDiv('agent-thinking-block__content');
	contentEl.setText(step.content);
}

function renderToolCallCard(container: HTMLElement, actionStep: AgentExecutionStep, observationStep: AgentExecutionStep | null): void {
	const isError = observationStep?.status === 'error';
	const isPending = actionStep.status === 'pending';
	const statusClass = isError ? 'is-error' : isPending ? 'is-pending' : 'is-success';

	// Card container
	const card = container.createDiv('agent-tool-call-card');
	card.addClass(statusClass);

	// Parse "toolName({...})" format
	const match = actionStep.content.match(/^([\w]+)\(([\s\S]*)\)$/);
	const toolName = match ? match[1] : actionStep.content;
	let argsStr = match ? match[2] : '';

	// Pretty-print arguments JSON
	try {
		const parsed = JSON.parse(argsStr);
		argsStr = JSON.stringify(parsed, null, 2);
	} catch (_e) { /* keep as-is */ }

	// Part 1: Title — tool name + status indicator
	const titleRow = card.createDiv('agent-tool-call__title');
	const dot = titleRow.createSpan('agent-tool-call__status-dot');
	dot.setText('●');
	const nameEl = titleRow.createSpan('agent-tool-call__name');
	nameEl.setText(toolName);
	if (isPending) {
		const spinner = titleRow.createSpan('agent-tool-call__spinner');
		spinner.setText('...');
	}

	// Part 2: Input — collapsible
	if (argsStr && argsStr !== '{}') {
		renderCollapsibleSection(card, 'Input', argsStr);
	}

	// Part 3: Output — collapsible
	if (observationStep) {
		renderCollapsibleSection(card, 'Output', observationStep.content, isError);
	} else if (isPending) {
		const pendingOutput = card.createDiv('agent-tool-call__pending');
		pendingOutput.setText('Running...');
	}
}

function renderCollapsibleSection(parent: HTMLElement, title: string, content: string, isError?: boolean): void {
	const section = parent.createDiv('agent-collapsible-section');

	const header = section.createDiv('agent-collapsible-section__header');
	header.createSpan().setText(title);
	const chevron = header.createSpan();
	chevron.setText('∨');

	const body = section.createDiv('agent-collapsible-section__body');
	body.addClass('ia-hidden');
	if (isError) {
		body.addClass('agent-collapsible-section__body--error');
	}
	body.setText(content);

	header.addEventListener('click', () => {
		if (body.classList.contains('ia-hidden')) {
			body.classList.remove('ia-hidden');
			chevron.setText('∧');
		} else {
			body.classList.add('ia-hidden');
			chevron.setText('∨');
		}
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
	title.setText('Execution Process');

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
