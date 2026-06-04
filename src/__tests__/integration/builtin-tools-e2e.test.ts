/**
 * End-to-end integration of the REAL tool layer against an in-memory vault.
 *
 * Closes the "tools were simulated" gap from the model-layer probe: here the
 * real ToolRegistry + real BuiltinToolSource + real builtin tool classes run
 * against a mock Obsidian App, exercising actual read/search/list execution and
 * the actual write-proposal contract enforced by ToolRegistry.executeTool.
 * No network, fully deterministic.
 */
import { App, TFile } from 'obsidian';
import { ToolRegistry } from '@/application/tools/tool-registry';
import { BuiltinToolSource } from '@/application/tools/sources/builtin-tool-source';

function makeFile(path: string, size: number): TFile {
	const f = new TFile();
	f.path = path;
	f.basename = (path.split('/').pop() ?? path).replace(/\.md$/, '');
	(f as any).extension = 'md';
	f.stat = { ctime: 0, mtime: 0, size };
	return f;
}

function inMemoryApp(): App {
	const contents = new Map<string, string>([
		['Projects/Alpha.md', '# Project Alpha\nQ3 billing system migration. Owner: Dana. Status: at risk.'],
		['Billing/Invoices.md', '# Invoices\nNet-30 terms. Contact billing@acme.com for disputes.'],
	]);
	const files = [...contents.keys()].map(p => makeFile(p, contents.get(p)!.length));
	const app = new App();
	app.vault.getMarkdownFiles = () => files;
	app.vault.getFiles = () => files;
	app.vault.getAbstractFileByPath = (p: string) => files.find(f => f.path === p) ?? null;
	(app.vault as any).read = async (f: TFile) => contents.get(f.path) ?? '';
	(app as any).metadataCache = { getFileCache: () => ({ frontmatter: {} }) };
	return app;
}

describe('Builtin tools end-to-end against an in-memory vault', () => {
	let registry: ToolRegistry;

	beforeEach(async () => {
		registry = new ToolRegistry();
		registry.registerSource(new BuiltinToolSource(inMemoryApp()));
		await registry.reload();
	});

	it('aggregates all builtin tools through the real registry', () => {
		const names = registry.getTools().map(t => t.llmName);
		expect(names).toEqual(expect.arrayContaining([
			'read_file', 'write_file', 'list_files', 'search_files',
			'create_note', 'append_to_note', 'update_properties',
			'read_canvas', 'update_canvas',
		]));
	});

	it('read_file actually reads vault content', async () => {
		const res = await registry.executeTool('read_file', { path: 'Projects/Alpha.md' });
		expect(res.success).toBe(true);
		expect(JSON.stringify(res.result)).toContain('Project Alpha');
	});

	it('search_files actually finds a note by content', async () => {
		const res = await registry.executeTool('search_files', { query: 'billing', search_content: true });
		expect(res.success).toBe(true);
		expect(JSON.stringify(res.result).toLowerCase()).toContain('invoices');
	});

	it('list_files actually lists the vault', async () => {
		const res = await registry.executeTool('list_files', {});
		expect(res.success).toBe(true);
		expect(JSON.stringify(res.result)).toContain('Alpha.md');
	});

	it('create_note returns a valid write PROPOSAL (never a direct write)', async () => {
		const res = await registry.executeTool('create_note', {
			title: 'Alpha Summary', folder: 'Summaries', content: '# Summary\nAt risk.',
		});
		expect(res.success).toBe(true);
		expect((res.result as any).type).toBe('write_proposal');
		expect((res.result as any).operation).toBe('create');
	});

	it('write_file returns a valid write PROPOSAL and passes the registry write-gate', async () => {
		// ToolRegistry.executeTool runs assertWriteProposalResult for vaultWrite
		// tools; a success here proves the gate accepts a real proposal.
		const res = await registry.executeTool('write_file', {
			path: 'Projects/Alpha.md', content: 'updated',
		});
		expect(res.success).toBe(true);
		expect((res.result as any).type).toBe('write_proposal');
	});

	it('resolveForAgent filters real tools by access config', () => {
		const all = registry.resolveForAgent({ sources: { 'builtin:builtin': 'all' } });
		expect(all.length).toBe(registry.getTools().length);

		const none = registry.resolveForAgent({ sources: {} });
		expect(none.length).toBe(0);

		const readOnly = registry.resolveForAgent({
			sources: { 'builtin:builtin': [registry.getToolByLlmName('read_file')!.toolId] },
		});
		expect(readOnly.map(t => t.llmName)).toEqual(['read_file']);
	});
});
