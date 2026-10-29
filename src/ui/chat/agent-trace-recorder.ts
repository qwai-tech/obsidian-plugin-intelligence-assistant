import type { AgentExecutionStep } from '@/features/llm';

type Phase = AgentExecutionStep['phase'];

export class AgentTraceRecorder {
	constructor(
		private readonly steps: AgentExecutionStep[],
		private readonly onChange: () => void,
	) {}

	call(toolName: string, args: Record<string, unknown>, thinking: string | undefined, phase: Phase): void {
		this.steps.push({
			type: 'action',
			content: `${toolName}(${JSON.stringify(args)})`,
			toolName,
			args,
			thinking: thinking || undefined,
			phase,
			timestamp: Date.now(),
			status: 'pending',
		});
		this.onChange();
	}

	result(success: boolean, output: string, phase: Phase): void {
		const pending = [...this.steps].reverse().find(step => step.type === 'action' && step.status === 'pending');
		if (pending) {
			pending.status = success ? 'success' : 'error';
			pending.result = output;
			pending.phase = pending.phase ?? phase;
		}
		this.onChange();
	}

	thought(thought: string, phase: Phase): void {
		this.steps.push({ type: 'thought', content: thought, phase, timestamp: Date.now() });
		this.onChange();
	}
}
