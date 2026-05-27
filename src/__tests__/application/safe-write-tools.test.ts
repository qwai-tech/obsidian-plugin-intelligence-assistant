import { TFile } from 'obsidian';
import { WriteFileTool } from '../../application/services/file-tools';
import { AppendToNoteTool, CreateNoteTool } from '../../application/services/search-tools';

function makeFile(path: string): TFile {
	const file = new TFile();
	file.path = path;
	file.name = path.split('/').pop() ?? path;
	file.extension = 'md';
	return file;
}

describe('safe write tools', () => {
	it('write_file returns a proposal without modifying an existing file', async () => {
		const existing = makeFile('Notes/A.md');
		const app = {
			vault: {
				getAbstractFileByPath: jest.fn().mockReturnValue(existing),
				read: jest.fn().mockResolvedValue('old content'),
				modify: jest.fn(),
				create: jest.fn(),
			},
		};

		const result = await new WriteFileTool(app as any).execute({
			path: 'Notes/A.md',
			content: 'new content',
		});

		expect(result.success).toBe(true);
		expect(result.result).toMatchObject({
			type: 'write_proposal',
			operation: 'update',
			path: 'Notes/A.md',
			applied: false,
		});
		expect(app.vault.modify).not.toHaveBeenCalled();
		expect(app.vault.create).not.toHaveBeenCalled();
	});

	it('create_note returns a proposal without creating the note', async () => {
		const app = {
			vault: {
				getAbstractFileByPath: jest.fn().mockReturnValue(null),
				create: jest.fn(),
			},
		};

		const result = await new CreateNoteTool(app as any).execute({
			title: 'New Idea',
			content: 'draft',
			folder: 'Inbox',
		});

		expect(result.success).toBe(true);
		expect(result.result).toMatchObject({
			type: 'write_proposal',
			operation: 'create',
			path: 'Inbox/New Idea.md',
			applied: false,
		});
		expect(app.vault.create).not.toHaveBeenCalled();
	});

	it('append_to_note returns a proposal without modifying the note', async () => {
		const existing = makeFile('Notes/A.md');
		const app = {
			vault: {
				getAbstractFileByPath: jest.fn().mockReturnValue(existing),
				read: jest.fn().mockResolvedValue('old content'),
				modify: jest.fn(),
			},
		};

		const result = await new AppendToNoteTool(app as any).execute({
			path: 'Notes/A.md',
			content: 'additional note',
		});

		expect(result.success).toBe(true);
		expect(result.result).toMatchObject({
			type: 'write_proposal',
			operation: 'append',
			path: 'Notes/A.md',
			applied: false,
		});
		expect(app.vault.modify).not.toHaveBeenCalled();
	});
});
