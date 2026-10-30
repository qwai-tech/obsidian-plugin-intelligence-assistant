import { TFile } from 'obsidian';
import { ObsidianFileSystem } from '@/adapters/obsidian/obsidian-file-system';

const appWith = (existing: TFile | null) => ({
	vault: {
		getAbstractFileByPath: jest.fn(() => existing),
		process: jest.fn(async (_file: TFile, fn: (data: string) => string) => fn('old')),
		create: jest.fn(async (_path: string, _data: string) => undefined),
		modify: jest.fn(),
		adapter: { exists: jest.fn(async () => true), mkdir: jest.fn(async () => undefined) },
	},
});

describe('ObsidianFileSystem.write', () => {
	it('replaces an existing file atomically', async () => {
		const file = Object.assign(new TFile(), { path: 'cache/spec.json' });
		const app = appWith(file);

		await new ObsidianFileSystem(app as never).write('cache/spec.json', 'new');

		expect(app.vault.process).toHaveBeenCalledWith(file, expect.any(Function));
		expect(await app.vault.process.mock.results[0].value).toBe('new');
		expect(app.vault.modify).not.toHaveBeenCalled();
	});

	it('creates a file that does not exist yet', async () => {
		const app = appWith(null);

		await new ObsidianFileSystem(app as never).write('spec.json', 'new');

		expect(app.vault.create).toHaveBeenCalledWith('spec.json', 'new');
	});
});
