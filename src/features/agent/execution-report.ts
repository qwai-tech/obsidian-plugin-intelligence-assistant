/** A budget halt is host status, not a model's pre-tool progress estimate. */
export function budgetExecutionReport(steps: number, successfulReadFileCalls: number): string {
	return [
		`Reached the agent step budget of ${steps}. The task has not been confirmed complete.`,
		`Host-recorded successful read_file calls in this run: ${successfulReadFileCalls}. This count includes the last completed tool result.`,
		'Review the saved tool results, or ask me to continue / raise this agent\'s max steps. Earlier model progress updates may predate the last tool result and are not a current count.',
	].join('\n\n');
}
