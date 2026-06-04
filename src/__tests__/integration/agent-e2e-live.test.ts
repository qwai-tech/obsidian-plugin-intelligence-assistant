/**
 * @jest-environment node
 *
 * FULL end-to-end LIVE verification: real LLM + real AgentEngineLoop + real
 * ToolRegistry + real builtin tools against an in-memory vault.
 *
 * This is the seam the probe and the deterministic tool test each covered only
 * half of. It makes REAL network calls and is therefore gated on
 * DEEPSEEK_API_KEY — it SKIPS automatically when the key is absent, so it is
 * safe to keep in the suite and never runs in normal CI.
 *
 * Run:  DEEPSEEK_API_KEY=sk-... npx jest agent-e2e-live
 */
import { App, TFile } from 'obsidian';
import { ToolRegistry } from '@/application/tools/tool-registry';
import { BuiltinToolSource } from '@/application/tools/sources/builtin-tool-source';
import { AgentEngineLoop, HistoryCompactor } from '@/application/agents';
import { InMemoryStateStore } from '@/application/agents/kernel/agent-engine-core';
import { DeepSeekProvider } from '@/infrastructure/llm/deepseek-provider';
import type { Message } from '@/types';

const KEY = process.env.DEEPSEEK_API_KEY;
const describeLive = KEY ? describe : describe.skip;

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
		['Projects/Alpha.md', '# Project Alpha\nQ3 billing system migration. Owner: Dana. Status: at risk due to vendor delays. Next milestone: API contract sign-off.'],
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

describeLive('LIVE agent end-to-end (real DeepSeek + real tools + in-memory vault)', () => {
	jest.setTimeout(90000);

	beforeAll(() => {
		// jsdom test env has no global fetch; the real provider needs it. Use
		// Node's undici (already a transitive dep) so streamChat can reach the API.
		if (typeof (global as any).fetch === 'undefined') {
			(global as any).fetch = require('undici').fetch;
		}
	});

	it('reads a real note and produces a real create_note write proposal', async () => {
		const registry = new ToolRegistry();
		registry.registerSource(new BuiltinToolSource(inMemoryApp()));
		await registry.reload();

		const senseService = {
			sense: async () => ({ userQuery: '', activeFilePath: 'Projects/Alpha.md', references: [], sections: [], ragSources: [], memory: null }),
			formatSenseContext: () => 'Active note: Projects/Alpha.md',
		};

		const toolCalls: string[] = [];
		const toolResults: Array<{ name: string; success: boolean }> = [];
		const completed: Message[] = [];
		let erroredWith: Error | null = null;

		const loop = new AgentEngineLoop({
			toolRegistry: registry,
			senseService: senseService as any,
			historyCompactor: new HistoryCompactor(),
			webSearchService: { search: async () => [], formatResultsAsContext: () => '' } as any,
			agentRunStateStore: new InMemoryStateStore(),
			createProvider: () => ({
				provider: new DeepSeekProvider({ provider: 'deepseek', apiKey: KEY!, baseUrl: 'https://api.deepseek.com/v1' }),
				providerId: 'deepseek',
			}),
		});

		await loop.execute(
			[{ role: 'user', content: 'Summarize the note "Projects/Alpha.md" and save the summary as a new note in folder "Summaries".' }],
			{
				model: 'deepseek-chat', mode: 'agent', agentId: 'a1',
				agents: [{ id: 'a1', maxSteps: 6, contextWindow: 20, toolAccess: { sources: { 'builtin:builtin': 'all' } } } as any],
				expectsWriteProposal: true,
			},
			{
				onChunk: () => {},
				onToolCall: (name) => { toolCalls.push(name); },
				onToolResult: (name, success) => { toolResults.push({ name, success }); },
				onThought: () => {},
				onComplete: (m) => { completed.push(m); },
				onError: (e) => { erroredWith = e; },
			},
		);

		// Diagnostics so the run is legible even if an assertion fails.

		console.log('[LIVE] tool calls:', toolCalls);
		console.log('[LIVE] tool results:', toolResults);
		console.log('[LIVE] final:', completed[0]?.content?.slice(0, 200));

		expect(erroredWith).toBeNull();
		// The model actually read the real note via the real tool.
		expect(toolCalls).toContain('read_file');
		expect(toolResults.find(r => r.name === 'read_file')?.success).toBe(true);
		// And produced a real write proposal via create_note (the vaultWrite gate passed).
		expect(toolCalls).toContain('create_note');
		expect(toolResults.find(r => r.name === 'create_note')?.success).toBe(true);
		expect(completed.length).toBe(1);
	});
});
