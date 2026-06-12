import { createHarnessApp } from '../../harness/in-memory-vault';
import { startMockLLM, stopMockLLM, mockLLM } from '../../harness/mock-llm-harness';
import { runAgentMission } from '../../harness/mission-runner';

describe('M7 tool-error-recovery', () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });
  it('surfaces a tool failure and lets the agent recover on the next turn', async () => {
    await mockLLM.toolCall('read_file', { path: 'missing.md' });
    await mockLLM.toolCall('read_file', { path: 'exists.md' });
    await mockLLM.replyWith('Recovered and read exists.md: RECOVER_OK.');
    const app = createHarnessApp({ 'exists.md': 'RECOVER_OK' });
    const outcome = await runAgentMission({ app, userMessage: 'Read missing.md, then recover.' });
    expect(outcome.error).toBeUndefined();
    const failed = outcome.toolResults.find((r) => r.toolName === 'read_file' && !r.success);
    expect(failed).toBeDefined();
    expect(failed!.output).toMatch(/failed|not found/i);
    expect(outcome.finalMessage?.content).toContain('RECOVER_OK');
    expect(outcome.toolCallCount).toBe(2);
  });
});
