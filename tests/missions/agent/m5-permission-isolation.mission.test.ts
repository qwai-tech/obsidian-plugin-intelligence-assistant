import { createHarnessApp } from '../../harness/in-memory-vault';
import { startMockLLM, stopMockLLM, mockLLM } from '../../harness/mock-llm-harness';
import { runAgentMission } from '../../harness/mission-runner';

describe('M5 permission-isolation', () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });
  it('denies a tool outside the agent allowlist and never executes the real tool', async () => {
    await mockLLM.toolCall('write_file', { path: 'forbidden.md', content: 'X' });
    await mockLLM.replyWith('I am not allowed to write.');
    const app = createHarnessApp({ 'readable.md': 'ok' });
    const outcome = await runAgentMission({
      app, userMessage: 'Write forbidden.md.', autonomousWrite: true,
      toolAccess: { sources: { 'builtin:builtin': ['builtin:builtin:read_file'] } },
    });
    expect(outcome.error).toBeUndefined();
    const wf = outcome.toolResults.find((r) => r.toolName === 'write_file');
    expect(wf).toBeDefined();
    expect(wf!.success).toBe(false);
    expect(wf!.output).toMatch(/not enabled/i);
    expect(await app.vault.adapter.exists('forbidden.md')).toBe(false);
  });
});
