import { createMockLLMServer, type MockLLMServer } from '../e2e/support/mock-llm-server';
import { createMockLLMClient } from '../e2e/support/mock-llm';

let server: MockLLMServer | null = null;

export function mockLLMPort(): number {
  if (!server) throw new Error('Mock LLM is not running; call startMockLLM() first.');
  return server.port();
}

export const mockLLM = createMockLLMClient(mockLLMPort);

export async function startMockLLM(): Promise<void> {
  server = createMockLLMServer({ port: 0 });
  await server.start();
  await mockLLM.clearAll();
}

export async function stopMockLLM(): Promise<void> {
  await server?.stop();
  server = null;
}
