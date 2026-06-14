import { ChatViewPage } from '../../pages/chat/chat-view.page';
import { createAgentConfig } from '../../support/data-fixtures';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { skipUnlessReleaseLLM } from '../../support/release-env';
import { VaultFixture } from '../../support/vault-fixture';

/**
 * SINGLE long-running large task: a REAL LLM drives ONE continuous autonomous
 * agentic task inside ONE real Obsidian session for >= LONG_TASK_TARGET_MIN
 * minutes (default 20). The task is large per-turn (write N long-form notes,
 * each >= LONG_TASK_WORDS words, one tool call each), so the single run stays
 * busy for the whole window. Verified by the REAL vault side effect.
 *
 * Opt-in: runs only when RUN_LONG_TASK=1.
 */
interface VaultDump { path: string; content: string; }

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
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
	if (paths.length === 0) return;
	await browser.execute(async (ps) => {
		const app = (window as unknown as {
			app: { vault: { adapter: { exists(p: string): Promise<boolean>; remove(p: string): Promise<void> } } };
		}).app;
		for (const p of ps) { if (await app.vault.adapter.exists(p)) await app.vault.adapter.remove(p); }
	}, paths);
}

const TARGET_MIN = Number(process.env.LONG_TASK_TARGET_MIN || 20);
const NOTES = Number(process.env.LONG_TASK_NOTES || 60);
const WORDS = Number(process.env.LONG_TASK_WORDS || 1200);
const MIN_CHARS = Number(process.env.LONG_TASK_MIN_CHARS || 2500);
const MAX_STEPS = Number(process.env.LONG_TASK_MAXSTEPS || NOTES + 40);
const MAX_TOKENS = Number(process.env.LONG_TASK_MAXTOKENS || 8000);
const NOTE_RE = /^note_\d+\.md$/;

describe('Release single long-running large task', () => {
	const chat = new ChatViewPage();
	const vault = new VaultFixture();

	before(function (this: Mocha.Context) {
		if (process.env.RUN_LONG_TASK !== '1') this.skip();
		skipUnlessReleaseLLM(this);
	});

	beforeEach(async () => {
		await waitForPluginReady();
		await vault.seedSettings({
			agents: [createAgentConfig({
				id: 'release-single-long-agent',
				name: 'Release Single Long Agent',
				toolAccess: { sources: { 'builtin:builtin': 'all' } },
				autonomousWrite: true,
				maxSteps: MAX_STEPS,
				maxTokens: MAX_TOKENS,
			})],
			activeAgentId: 'release-single-long-agent',
		});
	});

	it('executes ONE continuous large task for the target duration and the vault reflects it', async function (this: Mocha.Context) {
		this.timeout((TARGET_MIN + 30) * 60 * 1000);

		// pre-clean any leftover note_*.md / index.md
		const pre = await dumpVaultMarkdown();
		await deleteByPaths(pre.filter((d) => NOTE_RE.test(d.path) || d.path === 'index.md').map((d) => d.path));

		await chat.open();
		await chat.newChat();
		await chat.selectMode('agent');
		await chat.sendMessage([
			`Work fully autonomously, without asking for confirmation.`,
			`Your VERY FIRST output MUST be a create_note tool call for note_001.md — output NO preface, NO explanation, NO "I will start" text. Just call the tool immediately.`,
			`Create exactly ${NOTES} notes named note_001.md, note_002.md, ... note_${String(NOTES).padStart(3, '0')}.md, strictly in numeric order, ONE create_note tool call per note.`,
			`Each note must be an original, detailed article of AT LEAST ${WORDS} words on a DISTINCT subtopic of large language models, AI agents, retrieval systems and knowledge management — use multiple "##" sections, examples, and depth.`,
			`After every note you create, immediately call the tool again for the next one. After all ${NOTES} notes exist, create index.md linking every note with [[note_001]] ... style links.`,
			`NEVER reply with only text while the job is unfinished — every assistant turn until the job is done must contain a tool call. Do NOT stop, summarize, shortcut, or ask questions until all ${NOTES} notes AND index.md exist.`,
		].join(' '));

		const startedAt = Date.now();
		const deadlineMs = (TARGET_MIN + 28) * 60 * 1000;
		let completed = false;

		// Progress-logged wait: poll every 30s, log how many notes exist, until the
		// assistant turn completes (stop button hidden + a reply present) or deadline.
		while (Date.now() - startedAt < deadlineMs) {
			await sleep(30_000);
			let stopVisible = true;
			let msgCount = 0;
			try {
				stopVisible = await chat.isStopBtnVisible();
				msgCount = (await chat.getMessages()).length;
			} catch { /* transient DOM race; keep polling */ }
			const notesNow = (await dumpVaultMarkdown()).filter((d) => NOTE_RE.test(d.path)).length;
			const tS = Math.round((Date.now() - startedAt) / 1000);
			logLine(`[long-task] t=${tS}s notes=${notesNow}/${NOTES} stopVisible=${String(stopVisible)} msgs=${msgCount}`);
			if (!stopVisible && msgCount >= 2) { completed = true; break; }
		}

		const elapsedMin = (Date.now() - startedAt) / 60000;
		const dump = await dumpVaultMarkdown();
		const notes = dump.filter((d) => NOTE_RE.test(d.path));
		const substantial = notes.filter((d) => d.content.length >= MIN_CHARS);
		const index = dump.find((d) => d.path === 'index.md');
		const reply = await chat.getLastAssistantText().catch(() => '');

		logLine(`[long-task] SUMMARY completed=${String(completed)} elapsedMin=${elapsedMin.toFixed(1)} notes=${notes.length}/${NOTES} substantial(>=${MIN_CHARS}c)=${substantial.length} index=${String(Boolean(index))} reply="${reply.slice(0, 160)}"`);

		// cleanup
		await deleteByPaths([...notes.map((d) => d.path), 'index.md']);

		// Oracle: the single task ran for the target duration AND really produced
		// a large body of long-form notes in the vault.
		await expect(elapsedMin).toBeGreaterThanOrEqual(TARGET_MIN);
		await expect(substantial.length).toBeGreaterThanOrEqual(Math.floor(NOTES * 0.6));
	});
});
