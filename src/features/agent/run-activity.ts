export class RunActivity {
	private running = 0;
	private readonly listeners = new Set<() => void>();

	get isRunning(): boolean {
		return this.running > 0;
	}

	begin(): void {
		this.running++;
		this.notify();
	}

	end(): void {
		this.running = Math.max(0, this.running - 1);
		this.notify();
	}

	usageRecorded(): void {
		this.notify();
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}
}
