const MAX_SUMMARY_LENGTH = 360;

export function agentTaskLaunchText(prompt: string, displayText?: string): string {
	const summary = summarizeAgentTaskPrompt(prompt);
	const label = displayText?.trim();
	if (!label || summary.toLocaleLowerCase().startsWith(label.toLocaleLowerCase())) {
		return summary || label || '';
	}
	return summary && summary !== label ? `${label}\n${summary}` : label;
}

export function withUserTaskInput(prompt: string, taskInput: string): string {
	const trimmed = taskInput.trim();
	if (!trimmed) {
		return prompt;
	}
	return [
		prompt,
		'',
		'User task input from the launch dialog:',
		trimmed,
		'If this input conflicts with an earlier default topic, scope, or question, follow this user task input.',
	].join('\n');
}

function summarizeAgentTaskPrompt(prompt: string): string {
	const lines = prompt.split('\n').map((line) => line.trim()).filter(Boolean);
	const find = (pattern: RegExp) => lines.find((line) => pattern.test(line));

	const projectBrief = find(/^Create a project brief for:/i);
	if (projectBrief) {
		return truncate(projectBrief);
	}
	const researchCorpus = find(/^Research corpus:/i);
	const researchQuestion = find(/^Research question or topic:/i);
	if (researchCorpus || researchQuestion) {
		return truncate(['Create research brief', researchCorpus, researchQuestion].filter(Boolean).join('\n'));
	}
	const writingContext = find(/^Source context:/i);
	const writingGoal = find(/^Writing goal:/i);
	if (writingContext || writingGoal) {
		return truncate(['Draft from note', writingContext, writingGoal].filter(Boolean).join('\n'));
	}
	const preferred = find(/^(question|scope|target|note|create|find|summarize|run|inspect|diagnose|improve)/i);
	return truncate(preferred ?? lines[0] ?? 'Start agent task');
}

function truncate(summary: string): string {
	return summary.length > MAX_SUMMARY_LENGTH ? `${summary.slice(0, MAX_SUMMARY_LENGTH - 3)}...` : summary;
}
