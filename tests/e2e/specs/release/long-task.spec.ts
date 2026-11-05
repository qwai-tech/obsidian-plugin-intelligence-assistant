import { ChatViewPage } from '../../pages/chat/chat-view.page';
import { createAgentConfig } from '../../support/data-fixtures';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { skipUnlessReleaseLLM } from '../../support/release-env';
import { VaultFixture } from '../../support/vault-fixture';
import { captureReleaseProducts, finishedReleaseRun, wordCount } from '../../support/release-evidence';
import * as path from 'node:path';
import { dumpVaultMarkdown, deleteByPaths, assertReleaseChecker } from '../../support/release-long-vault';

/**
 * SINGLE long-running large task: a REAL LLM drives ONE continuous autonomous
 * agentic task inside ONE real Obsidian session for >= LONG_TASK_TARGET_MIN
 * minutes (default 20). The task is large per-turn (write N long-form notes,
 * each >= LONG_TASK_WORDS words, one tool call each), so the single run stays
 * busy for the whole window. Verified by the REAL vault side effect.
 *
 * Opt-in: runs only when RUN_LONG_TASK=1.
 */
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const logLine = (s: string): void => { process.stdout.write(`${s}\n`); };

const TARGET_MIN = Number(process.env.LONG_TASK_TARGET_MIN || 20);
const NOTES = Number(process.env.LONG_TASK_NOTES || 60);
const WORDS = Number(process.env.LONG_TASK_WORDS || 1200);
const MIN_CHARS = Number(process.env.LONG_TASK_MIN_CHARS || 2500);
const MAX_STEPS = Number(process.env.LONG_TASK_MAXSTEPS || NOTES * 6 + 40);
const MAX_TOKENS = Number(process.env.LONG_TASK_MAXTOKENS || 8000);
const NOTE_RE = /^note_\d+\.md$/;

describe('Release single long-running large task', function () {
	// WDIO captures the inherited runnable timeout BEFORE entering the test
	// function, so changing this only inside `it` leaves its 3-minute wrapper.
	this.timeout((TARGET_MIN + 30) * 60 * 1000);
	const chat = new ChatViewPage();
	const vault = new VaultFixture();

	before(function (this: Mocha.Context) {
		if (process.env.RUN_LONG_TASK !== '1') this.skip();
		skipUnlessReleaseLLM(this);
	});

	beforeEach(async () => {
		await waitForPluginReady();
		const vaultRoot = await browser.execute(() => (window as unknown as { app: { vault: { adapter: { getBasePath(): string } } } }).app.vault.adapter.getBasePath());
		await vault.seedSettings({
			cliTools: [{ id: 'release-word-check', name: 'check_note', description: 'Measure real file word count and SHA256. If meetsMinimum is false, expand the file. Use path * to aggregate all numbered articles and index links; complete must be true before finishing.', command: process.execPath, args: [path.resolve('tests/real/check-release-note.cjs'), vaultRoot, '{{path}}', String(WORDS), String(NOTES)], enabled: true, parameters: [{ name: 'path', type: 'string', description: 'Saved Markdown path, or * for the complete aggregate', required: true }] }],
			agents: [createAgentConfig({
				id: 'release-single-long-agent',
				name: 'Release Single Long Agent',
				toolAccess: { sources: { 'builtin:builtin': 'all', 'cli:release-word-check': 'all' } },
				autonomousWrite: true,
				maxSteps: MAX_STEPS,
				maxTokens: MAX_TOKENS,
			})],
			activeAgentId: 'release-single-long-agent',
		});
		await assertReleaseChecker();
	});

	it('executes ONE continuous large task for the target duration and the vault reflects it', async function (this: Mocha.Context) {
		this.timeout((TARGET_MIN + 30) * 60 * 1000);

		// pre-clean any leftover note_*.md / index.md
		const pre = await dumpVaultMarkdown();
		await deleteByPaths(pre.filter((d) => NOTE_RE.test(d.path) || d.path === 'index.md').map((d) => d.path));

		await chat.open(); await chat.newChat(); await chat.selectMode('agent');
		await chat.sendMessage([
			`Work fully autonomously, without asking for confirmation.`,
			`Your VERY FIRST output MUST be a create_note tool call for note_001.md — output NO preface, NO explanation, NO "I will start" text. Just call the tool immediately.`,
			`Create exactly ${NOTES} notes named note_001.md, note_002.md, ... note_${String(NOTES).padStart(3, '0')}.md, strictly in numeric order, ONE create_note tool call per note.`,
			`Each note must be an original, detailed article of AT LEAST ${WORDS} words on a DISTINCT subtopic of large language models, AI agents, retrieval systems and knowledge management — use multiple "##" sections, examples, and depth.`,
			`Aim for ${WORDS + 300} English words per article to leave a margin above the minimum; use a distinct descriptive first heading for each subtopic.`,
			`After each create_note, call the real check_note CLI with that note's path. Its words/meetsMinimum result is computed from the real saved file. If too short, read_file and write_file to expand it, then check_note again until meetsMinimum is true BEFORE creating the next note. Keep one create_note per article; corrections use write_file. Never invent or mentally estimate the measured count.`,
			`After a note passes check_note, immediately continue to the next one. After all ${NOTES} notes exist and pass, create index.md linking every note with [[note_001]] ... style links.`,
			'After creating index.md, call check_note with path * for a real aggregate count. Fix any measured shortage/missing note/link and repeat until its complete field is true. Report that measured aggregate instead of guessing totals.',
			`NEVER reply with only text while the job is unfinished — every assistant turn until the job is done must contain a tool call. Do NOT stop, summarize, shortcut, or ask questions until all ${NOTES} notes AND index.md exist.`,
			'Only after all requested notes and index links exist, finish with RELEASE_LONG_TASK_DONE. Never emit that marker for an incomplete or blocked task.',
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

		const wallElapsedMin = (Date.now() - startedAt) / 60000;
		const execution = process.env.IA_RELEASE_GATE === '1' ? await finishedReleaseRun(await chat.getConversationId()) : undefined;
		const elapsedMin = execution ? execution.durationMs / 60000 : wallElapsedMin;
		const dump = await dumpVaultMarkdown();
		const notes = dump.filter((d) => NOTE_RE.test(d.path));
		const substantial = notes.filter((d) => d.content.length >= MIN_CHARS);
		const longEnough = notes.filter(d => wordCount(d.content) >= WORDS);
		const index = dump.find((d) => d.path === 'index.md');
		const reply = await chat.getLastAssistantText().catch(() => '');

		logLine(`[long-task] SUMMARY completed=${String(completed)} elapsedMin=${elapsedMin.toFixed(1)} notes=${notes.length}/${NOTES} substantial(>=${MIN_CHARS}c)=${substantial.length} index=${String(Boolean(index))} reply="${reply.slice(0, 160)}"`);

		await captureReleaseProducts('long-task', [...notes, ...(index ? [index] : [])], { elapsedMin, wallElapsedMin, clock: execution ? 'agent-journal' : 'poll', execution, completed, expectedNotes: NOTES, minimumWords: WORDS, minimumMinutes: TARGET_MIN, substantial: substantial.length, longEnough: longEnough.length });
		// Every requested artifact and link must exist; elapsed time alone cannot
		// turn an incomplete or prematurely-ended task into a passing release gate.
		expect(completed).toBe(true); expect(reply).toContain('RELEASE_LONG_TASK_DONE');
		if (execution) { expect(execution.outcome).toBe('answered'); expect(execution.successfulCreates).toBeGreaterThanOrEqual(NOTES); expect(execution.successfulChecks).toBeGreaterThanOrEqual(NOTES); }
		expect(elapsedMin).toBeGreaterThanOrEqual(TARGET_MIN);
		expect(notes.length).toBe(NOTES); expect(substantial.length).toBe(NOTES);
		expect(longEnough.length).toBe(NOTES); expect(Boolean(index)).toBe(true);
		for (let i = 1; i <= NOTES; i++) {
			const stem = `note_${String(i).padStart(3, '0')}`;
			expect(notes.some(note => note.path === `${stem}.md`)).toBe(true);
			expect(index?.content).toMatch(new RegExp(`\\[\\[${stem}(?:\\.md)?(?:\\|[^\\]]*)?\\]\\]`));
		}
		expect(new Set(notes.map(note => note.content.trim())).size).toBe(NOTES);
		await deleteByPaths([...notes.map((d) => d.path), 'index.md']);
	});
});
