/**
 * A one-way channel for user-facing warnings, so this package can report a
 * degraded outcome without deciding how it gets shown.
 *
 * Model fetching falls back to a bundled default list when a provider's
 * `/models` endpoint is unreachable. That is worth telling the user about, but
 * an infrastructure module has no business constructing UI: hardcoding
 * Obsidian's `Notice` here would make the package unusable outside Obsidian and
 * untestable without a DOM. The host registers how to surface these instead.
 */

export interface LLMDiagnostic {
	level: 'warn' | 'error';
	message: string;
	cause?: unknown;
}

export type DiagnosticsSink = (diagnostic: LLMDiagnostic) => void;

const consoleSink: DiagnosticsSink = ({ level, message, cause }) => {
	if (level === 'error') {
		console.error(`[obsidian-llm] ${message}`, cause ?? '');
	} else {
		console.warn(`[obsidian-llm] ${message}`, cause ?? '');
	}
};

let sink: DiagnosticsSink = consoleSink;

/**
 * Route diagnostics somewhere the user can see them. In Obsidian this is
 * typically `({ message }) => new Notice(message)`.
 */
export function setDiagnosticsSink(next: DiagnosticsSink): void {
	sink = next;
}

/** Test seam: go back to console-only reporting. */
export function resetDiagnosticsSink(): void {
	sink = consoleSink;
}

export function reportDiagnostic(diagnostic: LLMDiagnostic): void {
	try {
		sink(diagnostic);
	} catch (error: unknown) {
		// A broken sink must never take down the operation that reported to it.
		consoleSink({ level: 'error', message: 'diagnostics sink threw', cause: error });
		consoleSink(diagnostic);
	}
}
