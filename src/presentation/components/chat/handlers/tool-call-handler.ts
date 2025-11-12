/**
 * Tool Call Handler
 * Manages agent tool call parsing, execution, and trace rendering
 */

import { Notice } from 'obsidian';
import type { Message } from '@/types';
import type { ToolCall } from '@/application/services/types';
import type { ToolManager } from '@/application/services/tool-manager';
import type { Agent } from '@/types';
import type { AgentExecutionStep } from '@/presentation/state/chat-view-state';

/**
 * Processes tool calls from agent response content
 */
export async function processToolCalls(
	content: string,
	messages: Message[],
	executionSteps: AgentExecutionStep[],
	toolManager: ToolManager,
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
			const json = JSON.parse(match[1]);

			// Handle both formats: { "name": "tool_name", "arguments": {...} } and { "tool": "tool_name", "arguments": {...} }
			const toolName = json.name || json.tool;
			if (!toolName || typeof toolName !== 'string') {
				console.log('Skipping non-tool call JSON block:', json);
				continue;
			}

			// Ensure it has the right structure to be a ToolCall
			const toolCall: ToolCall = {
				name: toolName,
				arguments: typeof json.arguments === 'object' && json.arguments !== null ? json.arguments : {}
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
						const fullToolKey = `${serverName}::${toolCall.name}`;
						
						// Check if this specific tool is enabled for the agent
						const hasSpecificToolEnabled = agent.enabledMcpTools?.includes(fullToolKey) || false;
						
						// Also check if the entire server is enabled for the agent
						const hasServerEnabled = agent.enabledMcpServers.includes(serverName);
						
						toolAllowed = hasSpecificToolEnabled || hasServerEnabled;
					} else {
						// For built-in tools, check if it's in enabledBuiltInTools
						toolAllowed = agent.enabledBuiltInTools.includes(toolCall.name as any);
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
				content: result.success ? JSON.stringify(result.result, null, 2) : `Error: ${result.error}`,
				timestamp: Date.now(),
				status: result.success ? 'success' : 'error'
			});

			refreshTrace();

			// Add tool result to messages for context
			messages.push({
				role: 'system',
				content: `Tool ${toolCall.name} result: ${result.success ? JSON.stringify(result.result) : result.error}`
			} as Message);

			toolsExecuted = true;

		} catch (error) {
			console.error('Tool call parsing error:', error);
			executionSteps.push({
				type: 'observation',
				content: `Error: ${error instanceof Error ? error.message : String(error)}`,
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
 */
export function updateExecutionTrace(container: HTMLElement, steps: AgentExecutionStep[]): void {
	// Clear existing trace content
	container.empty();

	// Create timeline for execution steps
	const timeline = container.createDiv('agent-execution-timeline');

	const latestIndex = steps.length - 1;
	steps.forEach((step, index) => {
		const stepEl = timeline.createDiv(`agent-step agent-step-${step.type}`);
		if (index === latestIndex) {
			stepEl.addClass('agent-step--latest');
		}
		if (step.status) {
			stepEl.addClass(`agent-step-status-${step.status}`);
		}

		// Step indicator
		const indicator = stepEl.createDiv('agent-step-indicator');
		if (step.type === 'thought') {
			indicator.innerHTML = '🧠';
		} else if (step.type === 'action') {
			indicator.innerHTML = '⚡';
		} else {
			indicator.innerHTML = '👁️';
		}

		// Step content
		const contentEl = stepEl.createDiv('agent-step-content');

		// Step header
		const header = contentEl.createDiv('agent-step-header');
		header.createSpan({ text: step.type.charAt(0).toUpperCase() + step.type.slice(1), cls: 'agent-step-type' });

		const time = new Date(step.timestamp);
		const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
		header.createSpan({ text: timeStr, cls: 'agent-step-time' });

		if (step.status) {
			const statusPill = header.createSpan('agent-step-status');
			statusPill.setText(step.status === 'pending' ? 'Pending' : step.status === 'success' ? 'Success' : 'Error');
			statusPill.addClass(`agent-step-status--${step.status}`);
		}

		// Step body
		const body = contentEl.createDiv('agent-step-body');
		if (step.type === 'action') {
			// Format action nicely
			const match = step.content.match(/^(\w+)\((.*)\)$/);
			if (match) {
				const toolName = match[1];
				const args = match[2];
				body.innerHTML = `<strong>${toolName}</strong><pre>${args}</pre>`;
			} else {
				body.setText(step.content);
			}
		} else if (step.type === 'observation') {
			// Format observation as code block
			const pre = body.createEl('pre');
			pre.setText(step.content);
		} else {
			body.setText(step.content);
		}
	});

	const traceRoot = container.closest('.agent-execution-trace-container');
	if (traceRoot) {
		const countEl = traceRoot.querySelector('.agent-trace-count');
		if (countEl) {
			countEl.textContent = `${steps.length} steps`;
		}
		const statusEl = traceRoot.querySelector('[data-trace-status]') as HTMLElement | null;
		if (statusEl) {
			const status = getTraceStatus(steps);
			statusEl.setAttr('data-trace-status', status.state);
			statusEl.setText(status.label);
		}
	}
}

function getTraceStatus(steps: AgentExecutionStep[]): { state: string; label: string } {
	if (!steps.length) {
		return { state: 'idle', label: 'Idle' };
	}

	const last = steps[steps.length - 1];
	if (last.status === 'error') {
		return { state: 'error', label: 'Error' };
	}
	if (last.type === 'action' && last.status === 'pending') {
		return { state: 'running', label: 'Running tool' };
	}
	if (last.type === 'thought') {
		return { state: 'thinking', label: 'Thinking' };
	}
	if (last.status === 'success' && last.type === 'observation') {
		return { state: 'success', label: 'Tool result' };
	}
	return { state: 'running', label: 'Working' };
}

/**
 * Creates a collapsible execution trace container
 */
export function createAgentExecutionTraceContainer(messageBody: HTMLElement, stepCount: number): HTMLElement {
	const traceContainer = messageBody.createDiv('agent-execution-trace-container');
	traceContainer.style.marginTop = '12px';

	// Collapsible header
	const header = traceContainer.createDiv('agent-execution-trace-header');
	const icon = header.createSpan('agent-trace-icon');
	icon.setText('▶');
	const title = header.createSpan('agent-trace-title');
	title.setText('Execution Trace');
	const status = header.createSpan('agent-trace-status');
	status.setAttr('data-trace-status', 'idle');
	status.setText('Idle');
	const count = header.createSpan('agent-trace-count');
	count.setText(`${stepCount} steps`);
	header.style.cursor = 'pointer';
	header.style.padding = '8px 12px';
	header.style.background = 'var(--background-secondary)';
	header.style.borderRadius = '6px';
	header.style.display = 'flex';
	header.style.alignItems = 'center';
	header.style.gap = '8px';
	header.style.fontWeight = '500';

	// Trace content (collapsed by default)
	const content = traceContainer.createDiv('agent-execution-trace-content');
	content.style.display = 'none';
	content.style.marginTop = '8px';
	content.style.padding = '12px';
	content.style.background = 'var(--background-primary)';
	content.style.borderRadius = '6px';
	content.style.border = '1px solid var(--background-modifier-border)';

	// Toggle on click
	let isExpanded = false;
	header.addEventListener('click', () => {
		isExpanded = !isExpanded;
		content.style.display = isExpanded ? 'block' : 'none';
		icon.setText(isExpanded ? '▼' : '▶');
	});

	return content;
}
