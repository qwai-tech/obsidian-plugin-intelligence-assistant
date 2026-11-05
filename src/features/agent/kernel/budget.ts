import type { FinishReason } from '@/features/agent/types/agent-run';

const MIN_ESTIMATED_STEPS = 10;
const ESTIMATE_SLACK = 3;
const ESTIMATE_MARKER = /<!--\s*ESTIMATED_STEPS:\s*(\d+)\s*-->/gi;

export interface BudgetOptions {
	fallbackSteps: number;
	ceiling: number;
	maxFailures: number;
}

export class Budget {
	private limit: number;
	private estimated = false;
	private steps = 0;
	private failures = 0;
	private lastFailure: { tool: string; streak: number } | null = null;

	constructor(private readonly options: BudgetOptions) {
		this.limit = options.fallbackSteps;
	}

	get stepLimit(): number {
		return this.limit;
	}

	estimate(text: string): string {
		const match = new RegExp(ESTIMATE_MARKER.source, 'i').exec(text);
		if (!this.estimated && match) {
			const steps = parseInt(match[1], 10);
			if (steps > 0) {
				this.limit = Math.max(MIN_ESTIMATED_STEPS, Math.min(steps + ESTIMATE_SLACK, this.options.ceiling));
			}
		}
		this.estimated = true;
		return text.replace(ESTIMATE_MARKER, '').trimEnd();
	}

	recordTool(tool: string, ok: boolean): void {
		this.steps++;
		if (ok) {
			if (this.lastFailure?.tool === tool) this.lastFailure = null;
			return;
		}
		this.failures++;
		this.lastFailure = { tool, streak: this.lastFailure?.tool === tool ? this.lastFailure.streak + 1 : 1 };
	}

	/** Rejected proposals cost a step, but are not executed-tool failures. */
	recordPreflightRejection(): void { this.steps++; }

	exhausted(): FinishReason | null {
		if (this.failures >= this.options.maxFailures && this.lastFailure) {
			return {
				kind: 'budget',
				limit: 'failures',
				failures: this.failures,
				tool: this.lastFailure.tool,
				consecutive: this.lastFailure.streak >= this.options.maxFailures,
			};
		}
		if (this.steps >= this.limit) {
			return { kind: 'budget', limit: 'steps', steps: this.limit };
		}
		return null;
	}
}
