import { createMockLLMServer, type MockLLMServer } from '../e2e/support/mock-llm-server';
import { createMockLLMClient } from '../e2e/support/mock-llm';

let server: MockLLMServer | null = null;

export function mockLLMPort(): number {
  if (!server) throw new Error('Mock LLM is not running; call startMockLLM() first.');
  return server.port();
}

const client = createMockLLMClient(mockLLMPort);
export const mockLLM = {
  ...client,
  /** A scripted final answer followed by the production guard's factual review. */
  async completeWith(text: string): Promise<void> {
    const answer = `${text}\n<!-- AGENT_STATUS: complete -->`;
    await client.replyWith(answer);
    await client.replyWith(answer);
  },
  async blockedWith(text: string): Promise<void> {
    await client.replyWith(`${text}\n<!-- AGENT_STATUS: blocked -->`);
  },
};

export async function startMockLLM(): Promise<void> {
  server = createMockLLMServer({ port: 0 });
  await server.start();
  await mockLLM.clearAll();
}

export async function stopMockLLM(): Promise<void> {
  await server?.stop();
  server = null;
}
