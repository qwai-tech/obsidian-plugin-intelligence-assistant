/**
 * Regression: AgentRepository.initialize() used to recurse infinitely on a
 * fresh vault (no agents/index.json), because initialize() seeds presets via
 * saveAll() and saveAll() re-enters initialize() before the `initialized` flag
 * is set — exhausting the heap (OOM). This test pins the fix.
 */
import { AgentRepository } from '@/infrastructure/persistence';

function makeApp() {
	const store: Record<string, string> = {};
	const adapter = {
		exists: jest.fn(async (p: string) => p in store),
		read: jest.fn(async (p: string) => { if (!(p in store)) throw new Error(`nf:${p}`); return store[p]; }),
		write: jest.fn(async (p: string, d: string) => { store[p] = d; }),
		remove: jest.fn(async (p: string) => { delete store[p]; }),
		mkdir: jest.fn(async () => {}),
		list: jest.fn(async () => ({ files: Object.keys(store), folders: [] })),
	};
	return { app: { vault: { adapter, createFolder: jest.fn(async () => {}) } } as any, store };
}

describe('AgentRepository.initialize (fresh vault)', () => {
	it('resolves without infinite recursion and seeds builtin presets', async () => {
		const { app, store } = makeApp();
		const repo = new AgentRepository(app);

		// Before the fix this never resolves (recurses to OOM). A finite resolve
		// within the default timeout is the assertion.
		await repo.initialize();

		// Seeding wrote the index + at least one preset agent file.
		expect(Object.keys(store).some(k => k.endsWith('index.json'))).toBe(true);
		const { agents } = await repo.loadAll();
		expect(agents.length).toBeGreaterThan(0);
	}, 5000);

	it('is idempotent: a second initialize() does not re-seed or throw', async () => {
		const { app } = makeApp();
		const repo = new AgentRepository(app);
		await repo.initialize();
		const first = (await repo.loadAll()).agents.length;
		await repo.initialize();
		const second = (await repo.loadAll()).agents.length;
		expect(second).toBe(first);
	}, 5000);
});
