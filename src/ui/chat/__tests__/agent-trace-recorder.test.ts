import { AgentTraceRecorder } from '../agent-trace-recorder';
import type { AgentExecutionStep } from '@/ui/state/chat-view-state';

describe('AgentTraceRecorder', () => {
	const setup = () => {
		const steps: AgentExecutionStep[] = [];
		const onChange = jest.fn();
		return { steps, onChange, recorder: new AgentTraceRecorder(steps, onChange) };
	};

	it('records a pending tool call and completes it with its result', () => {
		const { steps, onChange, recorder } = setup();

		recorder.call('search', { q: 'x' }, 'looking', 'act');
		recorder.result(true, 'found', 'act');

		expect(steps).toHaveLength(1);
		expect(steps[0]).toMatchObject({ type: 'action', toolName: 'search', content: 'search({"q":"x"})', thinking: 'looking', status: 'success', result: 'found' });
		expect(onChange).toHaveBeenCalledTimes(2);
	});

	it('completes the most recent pending call', () => {
		const { steps, recorder } = setup();

		recorder.call('a', {}, '', undefined);
		recorder.result(false, 'boom', undefined);
		recorder.call('b', {}, '', undefined);
		recorder.result(true, 'ok', undefined);

		expect(steps.map(step => step.status)).toEqual(['error', 'success']);
	});

	it('records thoughts', () => {
		const { steps, recorder } = setup();

		recorder.thought('thinking', 'plan');

		expect(steps[0]).toMatchObject({ type: 'thought', content: 'thinking', phase: 'plan' });
	});
});
