import type { GuardVerdict, ModelTurn, RunView, TurnGuard } from './turn-kernel';

/** Counts are supplied by the host's successful tool events, not model text. */
export interface ExecutionCountFacts {
	thisRunReads: number;
	previousRun?: { id: string; thisRunReads: number };
}

/** Validate unambiguous runtime count claims; domain totals are not run counts. */
export class ExecutionCountGuard implements TurnGuard {
	readonly name = 'execution-counts';
	private progress = -1;
	private attempts = 0;
	constructor(private readonly facts: () => ExecutionCountFacts) {}

	check(turn: ModelTurn, run: RunView): GuardVerdict {
		if (run.toolResults !== this.progress) { this.progress = run.toolResults; this.attempts = 0; }
		const actual = this.facts();
		const claims: Array<{ scope: string; value: unknown; expected: number }> = [];
		const visit = (value: unknown, expected = actual.thisRunReads): void => {
			if (!value || typeof value !== 'object') return;
			if (Array.isArray(value)) return;
			for (const [key, entry] of Object.entries(value)) {
				if (key === 'thisRunReads') claims.push({ scope: 'JSON thisRunReads', value: entry, expected });
				else if (key === 'currentRun' || key === 'executionCounts') visit(entry);
				else if (key === 'previousRun' && actual.previousRun) visit(entry, actual.previousRun.thisRunReads);
			}
		};
		// A fenced example of domain data has no implied runtime scope except
		// for the explicitly named thisRunReads field. Never reinterpret totals.
		const blocks = [...turn.text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/gi)].map(match => match[1]);
		if (!blocks.length) blocks.push(turn.text.replace(/<!--\s*AGENT_STATUS:[\s\S]*?-->/g, '').trim());
		for (const block of blocks) {
			try { visit(JSON.parse(block)); } catch { /* Not a structured runtime claim. */ }
		}
		const prose = turn.text.replace(/```[\s\S]*?```/g, '').replace(/[*`]/g, '');
		const modifiers = '(?:(?:further|additional|successful|confirming|verification|more)\\s+)*';
		const noun = '(?:read_file(?:\\s+calls)?|reads|re-reads|rereads)';
		const patterns = [
			new RegExp('(?:this (?:run|continuation)|the latest continuation)\\s+(?:I\\s+)?(?:performed|made|added|issued|executed|completed|supplied)\\s+(?:(?:only|exactly)\\s+)?(\\d+)\\s+' + modifiers + noun, 'gi'),
			new RegExp('(\\d+)\\s+' + modifiers + noun + '\\s+(?:in|during|since)\\s+(?:this (?:run|continuation)|the latest user message)', 'gi'),
		];
		for (const pattern of patterns) for (const match of prose.matchAll(pattern)) claims.push({ scope: 'prose current-run reads', value: Number(match[1]), expected: actual.thisRunReads });
		if (actual.previousRun) {
			for (const paragraph of prose.split(/\n\s*\n/)) {
				if (/(?:earlier|previous|prior)/i.test(paragraph) && /thisRunReads/i.test(paragraph) && new RegExp(`\\b${actual.previousRun.thisRunReads}\\b`).test(paragraph) && /(?:not supported|unsupported|withdrawn|retracted)/i.test(paragraph)) claims.push({ scope: 'false withdrawal of a recorded previous-run count', value: 'withdrawn', expected: actual.previousRun.thisRunReads });
			}
		}
		const wrong = claims.filter(claim => claim.value !== claim.expected);
		if (!wrong.length) return { kind: 'pass' };
		if (this.attempts++ >= 2) return { kind: 'stop', error: 'The final answer contradicts recorded current-run read counts after two correction attempts. No inconsistent answer was accepted; inspect the saved execution log.' };
		return {
			kind: 'retry',
			message: 'The proposed read count contradicts actual execution events; correcting the final explanation and JSON.',
			placeholder: '(inconsistent execution count rejected)',
			includeCandidate: false,
			correction: [
				'Host execution-count validation failed. The original task and permissions are unchanged.',
				`Actual successful read_file calls since the latest user message: ${actual.thisRunReads}. This is the CURRENT complete run count, INCLUDING all preceding tool results. Copy this exact integer for thisRunReads and any equivalent prose claim.`,
				...(actual.previousRun ? [`The DIFFERENT previous run ${actual.previousRun.id} recorded exactly ${actual.previousRun.thisRunReads} successful read_file calls. That count remains valid for THAT run. Do not withdraw or correct it merely because the current run has a different count.`] : []),
				`Rejected claims: ${JSON.stringify(wrong)}. They are model statements, not additional tool execution.`,
				'The latest execution snapshot follows ALL tool history and includes it already. Do not add history-window calls again or describe the current snapshot as the pre-continuation state.',
				'Rewrite a concise final explanation and JSON using only verified scoped facts. Remove unsupported intermediate arithmetic. Correcting the report does not require more tool calls or replaying completed work.',
			].join('\n'),
		};
	}
}
