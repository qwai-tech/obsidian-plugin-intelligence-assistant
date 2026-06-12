import { createHarnessApp } from '../../harness/in-memory-vault';
import { startMockLLM, stopMockLLM, mockLLM } from '../../harness/mock-llm-harness';
import { runAgentMission } from '../../harness/mission-runner';

describe('M2 rag-injection', () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });
  it('feeds retrieved RAG context into the agent LLM request', async () => {
    await mockLLM.replyWith('Based on the knowledge base, the answer is 42.');
    const app = createHarnessApp({});
    const outcome = await runAgentMission({
      app, userMessage: 'What is the answer according to my notes?',
      enableRAG: true, ragResults: [{ path: 'kb.md', content: 'The answer is 42. RAG_INJECTED_SENTINEL', title: 'KB' }],
    });
    expect(outcome.error).toBeUndefined();
    const calls = await mockLLM.getCalls();
    const firstChat = calls.find((c) => c.path === '/v1/chat/completions');
    expect(JSON.stringify(firstChat?.body)).toContain('RAG_INJECTED_SENTINEL');
  });
});
