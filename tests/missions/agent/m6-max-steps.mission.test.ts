import { createHarnessApp } from '../../harness/in-memory-vault';
import { startMockLLM, stopMockLLM, mockLLM } from '../../harness/mock-llm-harness';
import { runAgentMission } from '../../harness/mission-runner';

describe('M6 max-steps-budget', () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });
  it('halts gracefully when the step budget is exhausted', async () => {
    for (let i = 0; i < 5; i++) await mockLLM.toolCall('read_file', { path: 'loop.md' });
    await mockLLM.replyWith('done');
    const app = createHarnessApp({ 'loop.md': 'content' });
    const outcome = await runAgentMission({ app, userMessage: 'Keep reading loop.md.', maxSteps: 2 });
    expect(outcome.error).toBeUndefined();
    expect(outcome.finalMessage?.content ?? '').toMatch(/step budget/i);
    expect(outcome.toolCallCount).toBeLessThan(5);
  });
});
