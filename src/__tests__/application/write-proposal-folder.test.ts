/**
 * Regression: applying a "create" proposal whose path is inside a folder that
 * does not exist used to fail with ENOENT (vault.create does not create parent
 * folders). applyWriteProposal must create the missing parent folder(s) first.
 */
import { applyWriteProposal } from '@/application/services/write-proposal-service';

function makeApp() {
	const folders = new Set<string>();
	const created: string[] = [];
	const app = {
		vault: {
			getAbstractFileByPath: jest.fn((p: string) => (folders.has(p) ? ({} as any) : null)),
			createFolder: jest.fn(async (p: string) => { folders.add(p); }),
			create: jest.fn(async (p: string) => { created.push(p); }),
		},
	} as any;
	return { app, folders, created };
}

const proposal = (path: string) => ({ type: 'write_proposal' as const, operation: 'create' as const, path, reason: 'r', proposedContent: '# x', applied: false });

describe('applyWriteProposal — parent folder creation', () => {
	it('creates a missing single-level parent folder before the file', async () => {
		const { app, created } = makeApp();
		await applyWriteProposal(app, proposal('TOEFL 备考方案/0-总览.md'));
		expect(app.vault.createFolder).toHaveBeenCalledWith('TOEFL 备考方案');
		expect(created).toContain('TOEFL 备考方案/0-总览.md');
	});

	it('creates each missing nested ancestor segment', async () => {
		const { app } = makeApp();
		await applyWriteProposal(app, proposal('a/b/c/note.md'));
		expect(app.vault.createFolder.mock.calls.map((c: any[]) => c[0])).toEqual(['a', 'a/b', 'a/b/c']);
	});

	it('does not create a folder for a root-level file', async () => {
		const { app, created } = makeApp();
		await applyWriteProposal(app, proposal('root-note.md'));
		expect(app.vault.createFolder).not.toHaveBeenCalled();
		expect(created).toContain('root-note.md');
	});
});
