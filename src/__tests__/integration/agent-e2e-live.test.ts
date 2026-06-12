/**
 * @jest-environment node
 *
 * FULL end-to-end LIVE verification: real LLM + real AgentEngineLoop + real
 * ToolRegistry + real builtin tools against an in-memory vault.
 *
 * This is the seam the probe and the deterministic tool test each covered only
 * half of. It makes REAL network calls and is therefore OPT-IN: it runs only
 * when RUN_LIVE_AGENT_E2E=1 AND a key is present, so a globally-exported
 * DEEPSEEK_API_KEY can never trigger real calls during a normal `npm test`.
 * It SKIPS otherwise, so it is safe to keep in the suite / CI.
 *
 * Run:  RUN_LIVE_AGENT_E2E=1 DEEPSEEK_API_KEY=sk-... npx jest agent-e2e-live
 */
import { App, TFile } from 'obsidian';
import { ToolRegistry } from '@/application/tools/tool-registry';
import { BuiltinToolSource } from '@/application/tools/sources/builtin-tool-source';
import { AgentEngineLoop, HistoryCompactor } from '@/application/agents';
import { InMemoryStateStore } from '@/application/agents/kernel/agent-engine-core';
import { DeepSeekProvider } from '@/infrastructure/llm/deepseek-provider';
import type { Message } from '@/types';

const KEY = process.env.DEEPSEEK_API_KEY;
// Opt-in only: BOTH an explicit flag and a key are required, so an ambient
// DEEPSEEK_API_KEY (commonly exported for dev) never causes `npm test` to make
// real network calls.
const LIVE = process.env.RUN_LIVE_AGENT_E2E === '1' && !!KEY;
const describeLive = LIVE ? describe : describe.skip;

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
		// The jest.setup.js shim is loopback-only; live runs need a real fetch.
		// Assign unconditionally: the shim always defines global.fetch now, so a
		// guard would never fire and live https traffic would hit the loopback
		// block. This beforeAll only runs when LIVE is set (describeLive), so it
		// never overrides the loopback shim during a normal `npm test`.
		(global as any).fetch = require('undici').fetch;
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
