import { createHarnessApp } from './in-memory-vault';
import { startMockLLM, stopMockLLM, mockLLM } from './mock-llm-harness';
import { runAgentMission } from './mission-runner';

interface StreamChatRequest {
  stream?: boolean;
  messages?: Array<{ role: string; content: string }>;
  tools?: Array<{ type: string; function: { name: string } }>;
}

describe('mission runner walking skeleton', () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });

  it('runs a one-tool agent trajectory headless and reports the sentinel', async () => {
    await mockLLM.toolCall('read_file', { path: 'test-note.md' });
    await mockLLM.replyWith('The note contains AGENT_TOOL_SENTINEL from the vault.');

    const app = createHarnessApp({ 'test-note.md': 'AGENT_TOOL_SENTINEL' });

    const outcome = await runAgentMission({
      app,
      userMessage: 'Read test-note.md and report the sentinel.',
    });

    expect(outcome.error).toBeUndefined();
    expect(outcome.toolCalls.map((t) => t.toolName)).toContain('read_file');
    expect(outcome.finalMessage?.content).toContain('AGENT_TOOL_SENTINEL');

    const streamCalls = (await mockLLM.getCalls())
      .map((c) => c.body as StreamChatRequest | null)
      .filter((b) => b?.stream === true);
    expect(streamCalls).toHaveLength(2);
    expect(streamCalls[0]?.tools?.map((t) => t.function.name)).toContain('read_file');
    expect(streamCalls[1]?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'tool', content: expect.stringContaining('AGENT_TOOL_SENTINEL') }),
      ]),
    );
  });
});
