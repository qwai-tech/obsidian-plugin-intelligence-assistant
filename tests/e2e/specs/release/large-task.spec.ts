import { ChatViewPage } from '../../pages/chat/chat-view.page';
import { createAgentConfig } from '../../support/data-fixtures';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { skipUnlessReleaseLLM } from '../../support/release-env';
import { VaultFixture } from '../../support/vault-fixture';

/**
 * L3/L5 large-task stress test: a REAL LLM drives a multi-step autonomous
 * workflow inside REAL Obsidian. The agent must create four linked notes.
 *
 * The PRIMARY oracle is the REAL vault side effect — we scan the whole vault for
 * the required marker strings, wherever the agent chose to write them — not the
 * model's prose and not a UI element. The tool trace is a soft, logged signal.
 * This is the statistical (non-blocking) layer proving prompt + real model +
 * real Electron + real tool execution + real vault work end to end.
 */
interface VaultDump { path: string; content: string; }

/** Emit a metric line to the wdio Node stdout (this spec runs in the test runner, not the plugin). */
const logLine = (s: string): void => { process.stdout.write(`${s}\n`); };

async function dumpVaultMarkdown(): Promise<VaultDump[]> {
	return browser.execute(async () => {
		const app = (window as unknown as {
			app: { vault: { getMarkdownFiles(): Array<{ path: string }>; read(f: unknown): Promise<string> } };
		}).app;
		const out: VaultDump[] = [] as VaultDump[];
		for (const f of app.vault.getMarkdownFiles()) {
			try { out.push({ path: f.path, content: await app.vault.read(f) }); } catch { /* skip */ }
		}
		return out;
	}) as unknown as Promise<VaultDump[]>;
}

async function deleteByPaths(paths: string[]): Promise<void> {
	await browser.execute(async (ps) => {
		const app = (window as unknown as {
			app: { vault: { adapter: { exists(p: string): Promise<boolean>; remove(p: string): Promise<void> } } };
		}).app;
		for (const p of ps) { if (await app.vault.adapter.exists(p)) await app.vault.adapter.remove(p); }
	}, paths);
}

describe('Release large agentic task', () => {
	const chat = new ChatViewPage();
	const vault = new VaultFixture();
	const MARKERS = ['ALPHA_DONE', 'BETA_DONE', 'GAMMA_DONE'];

	before(function (this: Mocha.Context) {
		skipUnlessReleaseLLM(this);
	});

	beforeEach(async () => {
		await waitForPluginReady();
		await vault.seedSettings({
			agents: [createAgentConfig({
				id: 'release-large-task-agent',
				name: 'Release Large Task Agent',
				toolAccess: { sources: { 'builtin:builtin': 'all' } },
				autonomousWrite: true,
				maxSteps: 16,
			})],
			activeAgentId: 'release-large-task-agent',
		});
		await chat.open();
		await chat.newChat();
	});

	it('autonomously creates four linked notes and the vault really reflects them', async () => {
		await chat.selectMode('agent');
		await chat.sendMessage([
			'Complete this multi-step task autonomously, without asking for confirmation, by actually calling the vault write/create tools (do not just describe a plan).',
			'1) Create a note alpha.md whose body contains exactly the text ALPHA_DONE.',
			'2) Create a note beta.md whose body contains exactly the text BETA_DONE.',
			'3) Create a note gamma.md whose body contains exactly the text GAMMA_DONE.',
			'4) Create a note index.md that links to all three notes using [[alpha]], [[beta]] and [[gamma]].',
		].join(' '));

		const startedAt = Date.now();
		await chat.waitForReplyComplete(170_000);
		const elapsedMs = Date.now() - startedAt;

		const reply = await chat.getLastAssistantText();
		let trace = '';
		try { trace = await chat.getToolTraceText(); } catch { trace = '(no agent-trace element rendered)'; }

		const dump = await dumpVaultMarkdown();
		const toolCalls = (trace.match(/write_file|create_note|read_file|list_files|search_files/g) ?? []).length;
		// Metrics go to the wdio stdout stream (this spec runs in the Node test runner, not the plugin).
		logLine(`[large-task] elapsed=${(elapsedMs / 1000).toFixed(1)}s traceTools=${toolCalls} vaultMdFiles=${dump.length}`);
		logLine(`[large-task] reply: ${reply.slice(0, 400)}`);
		logLine('[large-task] vault files: ' + dump.map((d) => d.path).join(', '));
		logLine('[large-task] TRACE: ' + trace.replace(/\s+/g, ' ').slice(0, 1500));
		logLine('[large-task] marker hits: ' + MARKERS.map((m) => `${m}=${dump.filter((d) => d.content.includes(m)).map((d) => d.path).join('|') || 'MISSING'}`).join('  '));

		await expect(reply).not.toContain('❌ Error');

		// PRIMARY oracle: each marker exists in some real vault note (the agent
		// actually wrote it), and an index note links the three.
		for (const marker of MARKERS) {
			const hit = dump.find((d) => d.content.includes(marker));
			await expect(Boolean(hit)).toBe(true);
		}
		const indexNote = dump.find((d) => /\[\[\s*alpha/i.test(d.content) && /\[\[\s*beta/i.test(d.content) && /\[\[\s*gamma/i.test(d.content));
		await expect(Boolean(indexNote)).toBe(true);

		// Cleanup any notes the agent created (those carrying our markers + the index).
		const created = dump
			.filter((d) => MARKERS.some((m) => d.content.includes(m)) || d === indexNote)
			.map((d) => d.path);
		await deleteByPaths([...new Set([...created, 'alpha.md', 'beta.md', 'gamma.md', 'index.md'])]);
	});
});
