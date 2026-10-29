import type { RunActivity } from '@/application/services/run-activity';

export interface UsageTotals {
	getGrandTotal(): Promise<{ totalTokens: number }>;
}

export class AgentStatusBar {
	private readonly unsubscribe: () => void;

	constructor(
		private readonly el: HTMLElement,
		private readonly activity: RunActivity,
		private readonly usage: UsageTotals,
	) {
		this.unsubscribe = activity.onChange(() => this.render());
	}

	render(): void {
		this.usage.getGrandTotal()
			.then((summary) => this.paint(summary.totalTokens))
			.catch(() => this.paint(0));
	}

	dispose(): void {
		this.unsubscribe();
	}

	private paint(totalTokens: number): void {
		const running = this.activity.isRunning;
		const tokens = totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : `${totalTokens}`;
		this.el.setText(`IA: ${running ? 'running' : 'idle'} · ${tokens} tokens`);
		this.el.setAttr('aria-label', `Intelligence Assistant — ${running ? 'agent running' : 'idle'}, ${totalTokens} tokens used`);
	}
}
