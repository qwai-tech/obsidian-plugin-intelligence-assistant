/** Real DeepSeek history regression: actual model output and filesystem tool. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const baseUrl = process.env.IA_REAL_BASE_URL || 'http://127.0.0.1:17680/v1';
const apiKey = process.env.IA_REAL_API_KEY;
assert.ok(apiKey, 'IA_REAL_API_KEY required; no simulated responses');
const output = process.env.IA_REAL_RESULTS || 'test-results/codex-ux-fixes-2026-11-03';
await mkdir(output, { recursive: true });
const scratch = await mkdtemp(path.join(tmpdir(), 'ia-real-reasoning-'));
await build({ stdin: { contents: `export { ProviderFactory } from './packages/obsidian-llm/src/provider-factory'; export { setDefaultHttpPort, createFetchHttpPort } from './packages/obsidian-llm/src/http'; export { toOpenAiWireMessages } from './packages/obsidian-llm/src/openai-message';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', outfile: path.join(scratch, 'sdk.cjs'), logLevel: 'silent' });
const { ProviderFactory, setDefaultHttpPort, createFetchHttpPort, toOpenAiWireMessages } = createRequire(import.meta.url)(path.join(scratch, 'sdk.cjs'));
setDefaultHttpPort(createFetchHttpPort());
const provider = ProviderFactory.createProvider({ provider: 'custom', baseUrl, apiKey });
const model = process.env.IA_REAL_MODEL || 'deepseek/deepseek-flash';
const checks = [];
const nonce = `REAL_FILE_${randomUUID().replaceAll('-', '')}`;
const note = path.join(scratch, 'real-note.txt');
await writeFile(note, nonce);
const tools = [{ type: 'function', function: { name: 'read_test_note', description: 'Read the actual regression note from disk.', parameters: { type: 'object', properties: {} } } }];
async function turn(messages) {
    let content = '', reasoningContent = '';
    const calls = [];
    await provider.streamChat({ model, messages, tools, toolChoice: 'auto', maxTokens: 2048, signal: AbortSignal.timeout(120000) }, chunk => {
        content += chunk.content || '';
        reasoningContent += chunk.reasoning || '';
        calls.push(...chunk.toolCalls || []);
    });
    return { content, reasoningContent, calls };
}
const preface = { role: 'user', content: 'Calculate 37 times 29. Reply with the answer and PREPARED_OK.' };
const prepared = await provider.chat({ model, messages: [preface], maxTokens: 2048 });
assert.match(prepared.content, /1073/);
assert.ok(prepared.reasoning, 'Must receive actual model reasoning for the buffered preparation turn');
const history = [preface, { role: 'assistant', content: prepared.content, reasoningContent: prepared.reasoning }, { role: 'user', content: 'Call read_test_note exactly once, then reply with its exact content. Do not guess the note content.' }];
const first = await turn(history);
assert.equal(first.calls.length, 1);
assert.equal(first.calls[0].function.name, 'read_test_note');
const assistant = { role: 'assistant', content: first.content, reasoning_content: first.reasoningContent, tool_calls: first.calls };
history.push(assistant, { role: 'tool', tool_call_id: first.calls[0].id, content: await readFile(note, 'utf8') });
const second = await turn(history);
assert.match(second.content, new RegExp(nonce));
assert.equal(second.calls.length, 0);
checks.push({ name: 'real filesystem tool result is accepted with complete reasoning history', status: 'passed' });
history.push({ role: 'assistant', content: second.content, reasoningContent: second.reasoningContent }, { role: 'user', content: 'Reply exactly FOLLOW_UP_OK. Do not call tools.' });
history[1] = { role: 'assistant', content: prepared.content, reasoning_content: prepared.reasoning };
const third = await turn(history);
assert.match(third.content, /FOLLOW_UP_OK/);
assert.equal(third.calls.length, 0);
checks.push({ name: 'new user turn after real tool use preserves both working and persisted reasoning', status: 'passed' });
const legacy = history.map(message => {
    const { reasoning_content, reasoningContent, ...rest } = message;
    void reasoning_content; void reasoningContent;
    return rest;
});
const fourth = await turn(legacy);
assert.match(fourth.content, /FOLLOW_UP_OK/);
checks.push({ name: 'legacy assistant history without saved reasoning remains usable', status: 'passed' });
const strict = toOpenAiWireMessages(history);
assert.ok(strict.every(message => !('reasoning_content' in message)), 'Other OpenAI-compatible APIs must keep the strict default');
checks.push({ name: 'reasoning passback remains opt-in for strict OpenAI-compatible serializers', status: 'passed' });
await writeFile(path.join(output, 'reasoning-real.json'), JSON.stringify({ backend: baseUrl, model, mocks: false, checks }, null, 2));
console.log(JSON.stringify(checks));
