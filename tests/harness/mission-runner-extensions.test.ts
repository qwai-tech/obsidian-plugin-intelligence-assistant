import { createHarnessApp } from './in-memory-vault';
import { startMockLLM, stopMockLLM, mockLLM } from './mock-llm-harness';
import { runAgentMission } from './mission-runner';
import { createFakeToolSource } from './fake-tool-source';

describe('mission runner extensions', () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });

  it('toolAccess restricts which tools execute (disallowed tool is denied, not executed)', async () => {
    await mockLLM.toolCall('write_file', { path: 'blocked.md', content: 'X' });
    await mockLLM.replyWith('I could not write.');
    const app = createHarnessApp({});
    const outcome = await runAgentMission({
      app,
      userMessage: 'Try to write a file.',
      autonomousWrite: true,
      toolAccess: { sources: { 'builtin:builtin': ['builtin:builtin:read_file'] } },
    });
    expect(outcome.error).toBeUndefined();
    const wf = outcome.toolResults.find((r) => r.toolName === 'write_file');
    expect(wf?.success).toBe(false);
    expect(wf?.output).toMatch(/not enabled/i);
    expect(await app.vault.adapter.exists('blocked.md')).toBe(false);
  });

  it('abortAfterToolCalls stops the run early without error', async () => {
    await mockLLM.toolCall('read_file', { path: 'a.md' });
    await mockLLM.toolCall('read_file', { path: 'b.md' });
    await mockLLM.replyWith('done');
    const app = createHarnessApp({ 'a.md': 'A', 'b.md': 'B' });
    const outcome = await runAgentMission({ app, userMessage: 'Read a then b.', abortAfterToolCalls: 1 });
    expect(outcome.error).toBeUndefined();
    expect(outcome.toolCallCount).toBe(1);
  });

  it('injects RAG context into the LLM request when enableRAG + ragResults given', async () => {
    await mockLLM.replyWith('answer');
    const app = createHarnessApp({});
    await runAgentMission({
      app,
      userMessage: 'What do my notes say?',
      enableRAG: true,
      ragResults: [{ path: 'kb.md', content: 'RAG_CONTEXT_SENTINEL', title: 'KB' }],
    });
    const calls = await mockLLM.getCalls();
    const firstChat = calls.find((c) => c.path === '/v1/chat/completions');
    expect(JSON.stringify(firstChat?.body)).toContain('RAG_CONTEXT_SENTINEL');
  });

  it('runs a tool from an injected non-builtin tool source', async () => {
    await mockLLM.toolCall('fake_echo', { text: 'hi' });
    await mockLLM.replyWith('echoed');
    const app = createHarnessApp({});
    const outcome = await runAgentMission({
      app,
      userMessage: 'Echo hi.',
      extraToolSources: [createFakeToolSource()],
      toolAccess: { sources: { 'builtin:builtin': 'all', 'mcp:fake': 'all' } },
    });
    expect(outcome.error).toBeUndefined();
    const echo = outcome.toolResults.find((r) => r.toolName === 'fake_echo');
    expect(echo?.success).toBe(true);
    expect(echo?.output).toContain('hi');
  });

  it('passes a custom maxSteps to the agent', async () => {
    for (let i = 0; i < 5; i++) await mockLLM.toolCall('read_file', { path: 'loop.md' });
    await mockLLM.replyWith('done');
    const app = createHarnessApp({ 'loop.md': 'c' });
    const outcome = await runAgentMission({ app, userMessage: 'loop', maxSteps: 2 });
    expect(outcome.error).toBeUndefined();
    expect(outcome.toolCallCount).toBeLessThan(5);
  });
});
