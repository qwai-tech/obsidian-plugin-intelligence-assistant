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

	it('uses the last tool-call message text when the chain never answers', () => {
		const grouped = groupAgentChains([call('search', 'Still working'), toolResult('search', 'one hit')]);

		expect(grouped).toHaveLength(1);
		expect(grouped[0].content).toBe('Still working');
		expect(grouped[0].agentExecutionSteps?.map(step => step.type)).toEqual(['action', 'observation']);
	});

	it('keeps saved execution steps over reconstructed ones', () => {
		const saved = [{ type: 'thought', content: 'saved', timestamp: 1 }] as Message['agentExecutionSteps'];
		const grouped = groupAgentChains([{ ...call('search'), agentExecutionSteps: saved }, toolResult('search', 'hit'), { role: 'assistant', content: 'done' }]);

		expect(grouped).toHaveLength(1);
		expect(grouped[0].agentExecutionSteps).toBe(saved);
	});

	it('leaves an answer that merely contains JSON with a name field untouched', () => {
		const answer: Message = { role: 'assistant', content: 'Here is the record:\n```json\n{"name": "Alice"}\n```' };

		expect(groupAgentChains([{ role: 'user', content: 'json please' }, answer])).toEqual([{ role: 'user', content: 'json please' }, answer]);
	});
});
