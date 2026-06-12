import { createMockLLMServer, DEFAULT_MOCK_LLM_PORT, type MockLLMServer } from '../e2e/support/mock-llm-server';
import { mockLLM } from '../e2e/support/mock-llm';

let server: MockLLMServer | null = null;

export async function startMockLLM(): Promise<void> {
  server = createMockLLMServer({ port: DEFAULT_MOCK_LLM_PORT });
  await server.start();
  await mockLLM.clearAll();
}

export async function stopMockLLM(): Promise<void> {
  await server?.stop();
  server = null;
}

export { mockLLM };
export { DEFAULT_MOCK_LLM_PORT };
