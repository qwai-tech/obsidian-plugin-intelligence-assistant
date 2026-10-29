import { completionText, emitBufferedSse, sapLineParser } from '../providers/sap-sse';
import type { StreamChunk } from '../types';

const sse = (...events: unknown[]) => events.map((event) => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}`).join('\n');

const collect = (text: string, protocol: Parameters<typeof sapLineParser>[0]) => {
	const chunks: StreamChunk[] = [];
	emitBufferedSse(text, sapLineParser(protocol), (chunk) => chunks.push(chunk));
	return chunks;
};

describe('SAP buffered SSE', () => {
	it('reads OpenAI-style deltas and finishes with usage on the finish reason', () => {
		const chunks = collect(sse(
			{ choices: [{ delta: { content: 'Hel' } }] },
			{ choices: [{ delta: { content: 'lo' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } },
			{ choices: [{ delta: { content: 'ignored' } }] },
		), 'openai');

		expect(chunks).toEqual([
			{ content: 'Hel', done: false },
			{ content: 'lo', done: false },
			{ content: '', done: true, usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 } },
		]);
	});

	it('stops at a [DONE] marker', () => {
		expect(collect(sse('[DONE]', { choices: [{ delta: { content: 'late' } }] }), 'openai')).toEqual([{ content: '', done: true }]);
	});

	it('reads Vertex candidates and finishes on any finish reason', () => {
		expect(collect(sse(
			{ candidates: [{ content: { parts: [{ text: 'Hi' }] } }] },
			{ candidates: [{ content: { parts: [{ text: '!' }] }, finishReason: 'MAX_TOKENS' }] },
		), 'vertex')).toEqual([
			{ content: 'Hi', done: false },
			{ content: '!', done: false },
			{ content: '', done: true },
		]);
	});

	it('reads Bedrock Claude deltas and stops at a block or message stop', () => {
		expect(collect(sse(
			{ type: 'content_block_delta', delta: { text: 'Claude' } },
			{ type: 'content_block_stop' },
		), 'bedrock-claude')).toEqual([
			{ content: 'Claude', done: false },
			{ content: '', done: true },
		]);
	});

	it('reads Bedrock Converse deltas and stops at messageStop', () => {
		expect(collect(sse(
			{ contentBlockDelta: { delta: { text: 'Nova' } } },
			{ messageStop: {} },
		), 'bedrock-converse')).toEqual([
			{ content: 'Nova', done: false },
			{ content: '', done: true },
		]);
	});

	it('skips unparsable lines and ends the stream when the text runs out', () => {
		expect(collect(`data: {broken\n${sse({ choices: [{ delta: { content: 'ok' } }] })}`, 'openai')).toEqual([
			{ content: 'ok', done: false },
			{ content: '', done: true },
		]);
	});
});

describe('SAP buffered completions', () => {
	it.each([
		['openai', { choices: [{ message: { content: 'gpt' } }] }, 'gpt'],
		['vertex', { candidates: [{ content: { parts: [{ text: 'gemini' }] } }] }, 'gemini'],
		['bedrock-claude', { content: [{ text: 'claude' }] }, 'claude'],
		['bedrock-titan', { results: [{ outputText: 'titan' }] }, 'titan'],
		['bedrock-converse', { output: { message: { content: [{ text: 'nova' }] } } }, 'nova'],
	] as const)('extracts the %s answer', (protocol, json, expected) => {
		expect(completionText(protocol, json)).toBe(expected);
	});

	it('returns an empty answer for an unexpected shape', () => {
		expect(completionText('openai', {})).toBe('');
	});
});

