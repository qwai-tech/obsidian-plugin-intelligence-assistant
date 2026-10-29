import type { Message } from '@/features/conversations/types/conversation';
import { groupAgentChains } from '../message-grouping';

const call = (name: string, text = ''): Message => ({ role: 'assistant', content: `${text}\n\`\`\`json\n{"name":"${name}"}\n\`\`\`` });
const toolResult = (name: string, output: string): Message => ({ role: 'system', content: `Tool ${name} result: ${output}` });

describe('groupAgentChains', () => {
	it('passes chat messages through and drops stray system messages', () => {
		const user: Message = { role: 'user', content: 'hi' };
		const reply: Message = { role: 'assistant', content: 'hello' };

		expect(groupAgentChains([user, { role: 'system', content: 'note' }, reply])).toEqual([user, reply]);
	});

	it('folds a legacy tool-call chain into one answer with reconstructed steps', () => {
		const grouped = groupAgentChains([
			{ role: 'user', content: 'find' },
			call('search'),
			toolResult('search', 'two hits'),
			{ role: 'assistant', content: 'Found two notes.' },
		]);

		expect(grouped).toHaveLength(2);
		expect(grouped[1].content).toBe('Found two notes.');
		expect(grouped[1].agentExecutionSteps?.some(step => step.type === 'observation' && step.content === 'two hits')).toBe(true);
	});

	it('uses the final tool-call message text when the chain never answers', () => {
		const grouped = groupAgentChains([call('search', 'Still working')]);

		expect(grouped).toHaveLength(1);
		expect(grouped[0].content).toBe('Still working');
	});

	it('keeps saved execution steps over reconstructed ones', () => {
		const saved = [{ type: 'thought', content: 'saved', timestamp: 1 }] as Message['agentExecutionSteps'];
		const grouped = groupAgentChains([{ ...call('search'), agentExecutionSteps: saved }, { role: 'assistant', content: 'done' }]);

		expect(grouped[0].agentExecutionSteps).toBe(saved);
	});
});
