import { createHarnessApp } from '../../harness/in-memory-vault';
import { startMockLLM, stopMockLLM, mockLLM } from '../../harness/mock-llm-harness';
import { runAgentMission } from '../../harness/mission-runner';
import { createFakeToolSource } from '../../harness/fake-tool-source';

describe('M-ext non-builtin-tool-source', () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });
  it('discovers and invokes a tool from an injected non-builtin source', async () => {
    await mockLLM.toolCall('fake_echo', { text: 'NONBUILTIN_OK' });
    await mockLLM.replyWith('Echoed.');
    const app = createHarnessApp({});
    const outcome = await runAgentMission({
      app, userMessage: 'Echo NONBUILTIN_OK.',
      extraToolSources: [createFakeToolSource()],
      toolAccess: { sources: { 'builtin:builtin': 'all', 'mcp:fake': 'all' } },
    });
    expect(outcome.error).toBeUndefined();
    const echo = outcome.toolResults.find((r) => r.toolName === 'fake_echo');
    expect(echo?.success).toBe(true);
    expect(echo?.output).toContain('NONBUILTIN_OK');
  });
});
