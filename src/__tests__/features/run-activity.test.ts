import { RunActivity } from '@/features/agent/run-activity';

describe('RunActivity', () => {
	it('stays running until every started run has ended', () => {
		const activity = new RunActivity();

		activity.begin();
		activity.begin();
		activity.end();

		expect(activity.isRunning).toBe(true);
		activity.end();
		expect(activity.isRunning).toBe(false);
	});

	it('never counts below zero', () => {
		const activity = new RunActivity();

		activity.end();
		activity.begin();

		expect(activity.isRunning).toBe(true);
	});

	it('notifies listeners on run changes and usage, until they unsubscribe', () => {
		const activity = new RunActivity();
		const listener = jest.fn();
		const unsubscribe = activity.onChange(listener);

		activity.begin();
		activity.usageRecorded();
		unsubscribe();
		activity.end();

		expect(listener).toHaveBeenCalledTimes(2);
	});
});
