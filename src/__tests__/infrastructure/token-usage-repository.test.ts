import { TokenUsageRepository } from '@/infrastructure/persistence/data/token-usage-repository';
import type { UsageRecord } from '@/types/features/usage';

const makeApp = () => {
	const files = new Map<string, string>();
	const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
	const adapter = {
		exists: jest.fn(async (path: string) => files.has(path)),
		mkdir: jest.fn(async () => undefined),
		read: jest.fn(async (path: string) => {
			await tick();
			const body = files.get(path);
			if (body === undefined) throw new Error('missing');
			return body;
		}),
		write: jest.fn(async (path: string, body: string) => {
			await tick();
			files.set(path, body);
		}),
		remove: jest.fn(async (path: string) => {
			files.delete(path);
		}),
		rename: jest.fn(async (from: string, to: string) => {
			files.set(to, files.get(from) ?? '');
			files.delete(from);
		}),
	};
	return { app: { vault: { adapter } }, files };
};

const record = (model: string): UsageRecord => ({
	model,
	provider: 'openai',
	promptTokens: 1,
	completionTokens: 1,
	totalTokens: 2,
	timestamp: 1,
});

describe('TokenUsageRepository', () => {
	it('keeps every record when several runs finish at the same time', async () => {
		const { app } = makeApp();
		const repository = new TokenUsageRepository(app as never, 'usage.json');

		await Promise.all([record('a'), record('b'), record('c')].map((r) => repository.recordUsage(r)));

		const models = (await repository.getAllRecords()).map((r) => r.model).sort();
		expect(models).toEqual(['a', 'b', 'c']);
	});
});
