import { request } from 'node:http';
import { DEFAULT_MOCK_LLM_PORT } from '../e2e/support/mock-llm-server';
import { startMockLLM, stopMockLLM, mockLLM } from './mock-llm-harness';

function postChat(body: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = request(
      {
        hostname: '127.0.0.1',
        port: DEFAULT_MOCK_LLM_PORT,
        path: '/v1/chat/completions',
        method: 'POST',
        agent: false,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { raw += c; });
        res.on('end', () => resolve(raw));
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

describe('mock LLM harness', () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });

  it('serves a queued reply in jest', async () => {
    await mockLLM.replyWith('pong');
    const raw = await postChat({ model: 'mock-model', messages: [{ role: 'user', content: 'ping' }] });
    expect(raw).toContain('pong');
  });
});
