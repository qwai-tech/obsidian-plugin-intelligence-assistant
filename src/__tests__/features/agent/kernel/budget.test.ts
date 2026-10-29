import { Budget } from '@/features/agent/kernel/budget';

const budget = () => new Budget({ fallbackSteps: 25, ceiling: 50, maxFailures: 3 });

describe('Budget', () => {
	it('starts at the fallback step limit', () => {
		expect(budget().stepLimit).toBe(25);
	});

	it('takes the first-turn estimate plus slack, clamped between the floor and the ceiling', () => {
		const small = budget();
		const medium = budget();
		const huge = budget();

		small.estimate('<!-- ESTIMATED_STEPS: 2 -->');
		medium.estimate('plan\n<!-- ESTIMATED_STEPS: 12 -->');
		huge.estimate('<!-- ESTIMATED_STEPS: 400 -->');

		expect(small.stepLimit).toBe(10);
		expect(medium.stepLimit).toBe(15);
		expect(huge.stepLimit).toBe(50);
	});

	it('strips the marker and keeps the fallback when there is none', () => {
		const b = budget();

		expect(b.estimate('Checklist\n<!-- ESTIMATED_STEPS: 5 -->')).toBe('Checklist');
		expect(budget().estimate('no marker')).toBe('no marker');
	});

	it('only applies the first estimate', () => {
		const b = budget();
		b.estimate('<!-- ESTIMATED_STEPS: 12 -->');

		b.estimate('<!-- ESTIMATED_STEPS: 40 -->');

		expect(b.stepLimit).toBe(15);
	});

	it('is exhausted once the tool steps reach the limit', () => {
		const b = new Budget({ fallbackSteps: 2, ceiling: 50, maxFailures: 3 });
		b.recordTool('read', true);
		expect(b.exhausted()).toBeNull();

		b.recordTool('read', true);

		expect(b.exhausted()).toEqual({ kind: 'budget', limit: 'steps', steps: 2 });
	});

	it('stops after the failure limit and says when one tool failed every time', () => {
		const b = budget();
		b.recordTool('write', false);
		b.recordTool('write', false);
		b.recordTool('write', false);

		expect(b.exhausted()).toEqual({ kind: 'budget', limit: 'failures', failures: 3, tool: 'write', consecutive: true });
	});

	it('counts failures across tools for the failure limit', () => {
		const b = budget();
		b.recordTool('a', false);
		b.recordTool('b', true);
		b.recordTool('b', false);
		b.recordTool('c', false);

		expect(b.exhausted()).toEqual({ kind: 'budget', limit: 'failures', failures: 3, tool: 'c', consecutive: false });
	});
});
