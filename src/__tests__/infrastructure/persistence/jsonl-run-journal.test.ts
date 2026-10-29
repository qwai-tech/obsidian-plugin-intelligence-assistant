import { JsonlRunJournal } from '@/infrastructure/persistence/jsonl-run-journal';

const makeAdapter = () => {
	const files = new Map<string, string>();
	return {
		files,
		exists: jest.fn(async (path: string) => files.has(path) || path === 'runs'),
		mkdir: jest.fn(async () => undefined),
		append: jest.fn(async (path: string, data: string) => {
			await new Promise((resolve) => setTimeout(resolve, Math.random() * 3));
			files.set(path, (files.get(path) ?? '') + data);
		}),
	};
};

describe('JsonlRunJournal', () => {
	it('appends one line per event to the run file, in order, without rewriting earlier lines', async () => {
		const adapter = makeAdapter();
		const journal = new JsonlRunJournal(adapter as never, 'runs', () => 1000);

		await Promise.all([
			journal.append('r1', { type: 'run_started', runId: 'r1', stepLimit: 25 }),
			journal.append('r1', { type: 'turn_started', turn: 1 }),
			journal.append('r1', { type: 'text_delta', text: 'hi' }),
		]);

		const lines = (adapter.files.get('runs/r1.jsonl') ?? '').trim().split('\n').map((line) => JSON.parse(line) as { at: number; event: { type: string } });
		expect(lines.map((line) => line.event.type)).toEqual(['run_started', 'turn_started', 'text_delta']);
		expect(lines[0].at).toBe(1000);
		expect(adapter.append).toHaveBeenCalledTimes(3);
	});
});
