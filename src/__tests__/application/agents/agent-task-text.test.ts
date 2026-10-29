import { agentTaskLaunchText, withUserTaskInput } from '@/application/agents/agent-task-text';

describe('agent task text', () => {
	it('summarizes a project brief prompt to its brief line', () => {
		const prompt = 'You are helping.\nCreate a project brief for: Projects/Apollo.md\nMore detail';

		expect(agentTaskLaunchText(prompt)).toBe('Create a project brief for: Projects/Apollo.md');
	});

	it('summarizes a research prompt from its corpus and question', () => {
		const prompt = 'Research corpus: Notes/\nResearch question or topic: pricing\nSteps follow';

		expect(agentTaskLaunchText(prompt)).toBe('Create research brief\nResearch corpus: Notes/\nResearch question or topic: pricing');
	});

	it('puts the display label above a summary that does not start with it', () => {
		expect(agentTaskLaunchText('Summarize Notes/a.md', 'Quick look')).toBe('Quick look\nSummarize Notes/a.md');
	});

	it('keeps the summary alone when it already starts with the label', () => {
		expect(agentTaskLaunchText('Summarize Notes/a.md', 'summarize')).toBe('Summarize Notes/a.md');
	});

	it('truncates long summaries to 360 characters', () => {
		const summary = agentTaskLaunchText(`Find ${'x'.repeat(500)}`);

		expect(summary).toHaveLength(360);
		expect(summary.endsWith('...')).toBe(true);
	});

	it('appends the user task input with a precedence instruction', () => {
		expect(withUserTaskInput('Base prompt', '  only the intro  ')).toBe([
			'Base prompt',
			'',
			'User task input from the launch dialog:',
			'only the intro',
			'If this input conflicts with an earlier default topic, scope, or question, follow this user task input.',
		].join('\n'));
	});

	it('leaves the prompt unchanged when the user task input is blank', () => {
		expect(withUserTaskInput('Base prompt', '   ')).toBe('Base prompt');
	});
});
