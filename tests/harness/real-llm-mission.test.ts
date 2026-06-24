import { createHarnessApp } from './in-memory-vault';
import { runAgentMission } from './mission-runner';

/**
 * REAL-LLM mission: drives the full AgentEngineLoop (the migrated @agentic-kernel
 * core + our planner/tool adapter) against a live model via node `fetch` — no
 * browser CORS. Validates end-to-end that a real model reads a vault file through
 * the read_file tool and returns the sentinel.
 *
 * Skipped unless MISSION_LLM_BASE_URL / _API_KEY / _MODEL are set, so it never
 * runs in the deterministic/flake-soak/CI suites. Run it directly, e.g.:
 *   MISSION_LLM_BASE_URL=http://127.0.0.1:17680/v1 MISSION_LLM_API_KEY=… \
 *   MISSION_LLM_MODEL=deepseek/deepseek-v4-pro npx jest tests/harness/real-llm-mission.test.ts
 */
const REAL_LLM = Boolean(
	process.env.MISSION_LLM_BASE_URL && process.env.MISSION_LLM_API_KEY && process.env.MISSION_LLM_MODEL,
);

(REAL_LLM ? describe : describe.skip)('real-LLM mission (live model)', () => {
	it('reads a vault file via read_file and returns the sentinel', async () => {
		const app = createHarnessApp({ 'test-note.md': 'AGENT_TOOL_SENTINEL' });

		const outcome = await runAgentMission({
			app,
			userMessage: [
				'Use the read_file tool to read test-note.md.',
				'Then reply with the exact sentinel string you find in it.',
				'Do not answer from memory; call the tool first.',
			].join(' '),
			timeoutMs: 120_000,
		});

		// eslint-disable-next-line no-console
		console.log('[real-llm-mission] tools:', outcome.toolCalls.map((t) => t.toolName),
			'| reply:', JSON.stringify(outcome.finalMessage?.content?.slice(0, 200)));

		expect(outcome.error).toBeUndefined();
		expect(outcome.toolCalls.map((t) => t.toolName)).toContain('read_file');
		expect(outcome.finalMessage?.content).toContain('AGENT_TOOL_SENTINEL');
	}, 130_000);
});
