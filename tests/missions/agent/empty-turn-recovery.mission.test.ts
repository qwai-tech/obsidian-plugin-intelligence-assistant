import { createHarnessApp } from '../../harness/in-memory-vault';
import { startMockLLM, stopMockLLM, mockLLM } from '../../harness/mock-llm-harness';
import { runAgentMission } from '../../harness/mission-runner';

/**
 * Regression for the silent-truncation bug: when the model returns an EMPTY turn
 * (no content, no tool call — the user-visible symptom of a truncated/dropped
 * tool call when output exceeds maxTokens), the agent must NOT silently finish
 * having done nothing. It should retry past the empty turn and still execute the
 * remaining work.
 */
describe('empty-turn recovery (truncated tool call)', () => {
	beforeEach(async () => { await startMockLLM(); });
	afterEach(async () => { await stopMockLLM(); });

	it('retries past an empty model turn instead of silently completing', async () => {
		await mockLLM.replyWith('');                          // empty turn (simulated truncation)
		await mockLLM.toolCall('read_file', { path: 'a.md' }); // recovery turn
		await mockLLM.replyWith('Recovered: SENTINEL_OK.');    // final
		const app = createHarnessApp({ 'a.md': 'x' });

		const outcome = await runAgentMission({ app, userMessage: 'read a.md' });

		expect(outcome.error).toBeUndefined();
		// The agent retried past the empty turn and actually called the tool.
		const read = outcome.toolResults.find((r) => r.toolName === 'read_file');
		expect(read).toBeDefined();
		expect(outcome.finalMessage?.content).toContain('SENTINEL_OK');
	});

	it('surfaces a clear message instead of empty when the model keeps returning empty', async () => {
		// Three empty turns in a row — retries get exhausted.
		await mockLLM.replyWith('');
		await mockLLM.replyWith('');
		await mockLLM.replyWith('');
		await mockLLM.replyWith('');
		const app = createHarnessApp({});

		const outcome = await runAgentMission({ app, userMessage: 'do something large' });

		expect(outcome.error).toBeUndefined();
		// Not a silent empty completion — the final message explains what happened.
		expect((outcome.finalMessage?.content ?? '').toLowerCase()).toMatch(/empty|truncat|max tokens/);
	});
});
