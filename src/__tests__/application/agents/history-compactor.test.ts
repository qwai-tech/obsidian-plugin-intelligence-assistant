import type { AgentSenseContext, AgentWorkingMessage } from '@/application/agents';
import { SPAR_PHASES } from '@/application/agents';

describe('agent runtime types', () => {
	it('allows a system research log working message', () => {
		const context: AgentSenseContext = {
			userQuery: 'organize this project',
			activeFilePath: 'Projects/A.md',
			references: [],
			sections: [{ title: 'Active note', content: 'A', source: 'active-note' }],
			ragSources: [],
			memory: null,
		};
		const msg: AgentWorkingMessage = {
			role: 'system',
			content: `Research Log:\n${context.sections[0].content}`,
		};

		expect(msg.content).toContain('Research Log');
		expect(context.sections[0].source).toBe('active-note');
		expect(SPAR_PHASES).toEqual(['sense', 'plan', 'act', 'reflect', 'final']);
	});
});
