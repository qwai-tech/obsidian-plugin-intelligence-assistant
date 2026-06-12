import { createHarnessApp } from '../../harness/in-memory-vault';
import { startMockLLM, stopMockLLM, mockLLM } from '../../harness/mock-llm-harness';
import { runAgentMission } from '../../harness/mission-runner';

describe('M8 stop-mid-task', () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });
  it('aborts cleanly after the first tool call and skips the rest', async () => {
    await mockLLM.toolCall('write_file', { path: 'first.md', content: 'one' });
    await mockLLM.toolCall('write_file', { path: 'second.md', content: 'two' });
    await mockLLM.replyWith('done');
    const app = createHarnessApp({});
    const outcome = await runAgentMission({ app, userMessage: 'Write first then second.', autonomousWrite: true, abortAfterToolCalls: 1 });
    expect(outcome.error).toBeUndefined();
    expect(outcome.toolCallCount).toBe(1);
    expect(await app.vault.adapter.exists('second.md')).toBe(false);
  });
});
