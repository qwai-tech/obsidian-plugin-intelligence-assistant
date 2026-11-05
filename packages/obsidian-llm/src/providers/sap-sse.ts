import type { StreamChunk, TokenUsage } from '../types';

export type SapProtocol = 'openai' | 'vertex' | 'bedrock-claude' | 'bedrock-converse';
type CompletionProtocol = SapProtocol | 'bedrock-titan';
type ToolCall = NonNullable<StreamChunk['toolCalls']>[number];
type Json = Record<string, unknown>;
export interface SapLine {
	content?: string;
	reasoning?: string;
	done?: boolean;
	usage?: TokenUsage;
	toolCalls?: ToolCall[];
}
type LineParser = (data: unknown) => SapLine;
const obj = (value: unknown): Json => value && typeof value === 'object' ? value as Json : {};
const list = (value: unknown): Json[] => Array.isArray(value) ? value.map(obj) : [];
const str = (value: unknown): string => typeof value === 'string' ? value : '';
const num = (value: unknown): number => typeof value === 'number' ? value : 0;
const call = (id: unknown, name: unknown, args: unknown): ToolCall => ({
	id: str(id), type: 'function', function: { name: str(name), arguments: typeof args === 'string' ? args : JSON.stringify(args ?? {}) },
});
const usage = (input: unknown, output: unknown, total?: unknown): TokenUsage => ({
	promptTokens: num(input), completionTokens: num(output), totalTokens: typeof total === 'number' ? total : num(input) + num(output),
});

/** State belongs to one response, including partial tool arguments and token usage. */
export function sapLineParser(protocol: SapProtocol): LineParser {
	const pending = new Map<number, ToolCall>();
	let inputTokens = 0;
	return raw => {
		const data = obj(raw);
		if (data.error || data.type === 'error') throw new Error('SAP AI Core returned a stream error.');
		if (protocol === 'vertex') {
			const parts = list(obj(list(data.candidates)[0]?.content).parts);
			const meta = obj(data.usageMetadata);
			return {
				content: parts.map(part => str(part.text)).join(''),
				toolCalls: parts.filter(part => part.functionCall).map((part, index) => {
					const fn = obj(part.functionCall);
					return call(`sap-gemini-${index}`, fn.name, fn.args);
				}),
				usage: data.usageMetadata ? usage(meta.promptTokenCount, meta.candidatesTokenCount, meta.totalTokenCount) : undefined,
			};
		}
		if (protocol === 'bedrock-claude') {
			if (data.type === 'message_start') inputTokens = num(obj(obj(data.message).usage).input_tokens);
			const index = num(data.index);
			const block = obj(data.content_block);
			if (data.type === 'content_block_start' && block.type === 'tool_use') pending.set(index, call(block.id, block.name, ''));
			const delta = obj(data.delta);
			if (delta.type === 'input_json_delta') {
				const tool = pending.get(index);
				if (tool) tool.function.arguments += str(delta.partial_json);
			}
			const tool = data.type === 'content_block_stop' ? pending.get(index) : undefined;
			if (tool) pending.delete(index);
			return {
				content: str(delta.text) || (block.type === 'text' ? str(block.text) : ''),
				toolCalls: tool ? [{ ...tool, function: { ...tool.function, arguments: tool.function.arguments || '{}' } }] : undefined,
				usage: data.type === 'message_delta' ? usage(inputTokens, obj(data.usage).output_tokens) : undefined,
				done: data.type === 'message_stop',
			};
		}
		if (protocol === 'bedrock-converse') {
			const start = obj(data.contentBlockStart);
			const toolStart = obj(obj(start.start).toolUse);
			if (toolStart.toolUseId) pending.set(num(start.contentBlockIndex), call(toolStart.toolUseId, toolStart.name, ''));
			const blockDelta = obj(data.contentBlockDelta);
			const delta = obj(blockDelta.delta);
			const tool = pending.get(num(blockDelta.contentBlockIndex));
			if (tool) tool.function.arguments += str(obj(delta.toolUse).input);
			const stop = obj(data.contentBlockStop);
			const complete = data.contentBlockStop ? pending.get(num(stop.contentBlockIndex)) : undefined;
			if (complete) pending.delete(num(stop.contentBlockIndex));
			const meta = obj(obj(data.metadata).usage);
			return { content: str(delta.text), toolCalls: complete ? [complete] : undefined,
				usage: data.metadata ? usage(meta.inputTokens, meta.outputTokens, meta.totalTokens) : undefined };
		}
		const choice = list(data.choices)[0] ?? {};
		const delta = obj(choice.delta);
		for (const fragment of list(delta.tool_calls)) {
			const index = num(fragment.index);
			const fn = obj(fragment.function);
			const tool = pending.get(index) ?? call(fragment.id, fn.name, '');
			tool.id = str(fragment.id) || tool.id;
			tool.function.name = str(fn.name) || tool.function.name;
			tool.function.arguments += str(fn.arguments);
			pending.set(index, tool);
		}
		const calls = choice.finish_reason === 'tool_calls' ? [...pending.values()] : undefined;
		if (calls) pending.clear();
		const meta = obj(data.usage);
		return { content: str(delta.content), reasoning: str(delta.reasoning_content), toolCalls: calls,
			usage: data.usage ? usage(meta.prompt_tokens, meta.completion_tokens, meta.total_tokens) : undefined };
	};
}

/** The Obsidian buffered transport still returns real service data, including tool calls. */
export function emitBufferedSse(text: string, parse: LineParser, onChunk: (chunk: StreamChunk) => void): void {
	let lastUsage: TokenUsage | undefined;
	let frames = 0;
	for (const line of text.split(/\r?\n/)) {
		if (!line.startsWith('data:')) continue;
		const data = line.slice(5).trim();
		if (data === '[DONE]') break;
		if (!data) continue;
		let parsed: unknown;
		try { parsed = JSON.parse(data); } catch { throw new Error('SAP AI Core returned malformed stream data.'); }
		const chunk = parse(parsed);
		frames++;
		lastUsage = chunk.usage ?? lastUsage;
		if (chunk.content || chunk.reasoning || chunk.toolCalls?.length) onChunk({ ...chunk, content: chunk.content ?? '', done: false });
		if (chunk.done) break;
	}
	if (frames === 0) throw new Error('SAP AI Core returned no readable stream events.');
	onChunk({ content: '', done: true, usage: lastUsage });
}

export function emitSAPCompletion(protocol: CompletionProtocol, raw: unknown, onChunk: (chunk: StreamChunk) => void): void {
	const data = obj(raw);
	let content = '';
	let toolCalls: ToolCall[] = [];
	let tokens: TokenUsage | undefined;
	if (protocol === 'bedrock-claude') {
		const blocks = list(data.content);
		content = blocks.map(block => str(block.text)).join('');
		toolCalls = blocks.filter(block => block.type === 'tool_use').map(block => call(block.id, block.name, block.input));
		const meta = obj(data.usage);
		tokens = usage(meta.input_tokens, meta.output_tokens);
	} else if (protocol === 'bedrock-converse') {
		const blocks = list(obj(obj(data.output).message).content);
		content = blocks.map(block => str(block.text)).join('');
		toolCalls = blocks.filter(block => block.toolUse).map(block => { const fn = obj(block.toolUse); return call(fn.toolUseId, fn.name, fn.input); });
		const meta = obj(data.usage);
		tokens = usage(meta.inputTokens, meta.outputTokens, meta.totalTokens);
	} else if (protocol === 'bedrock-titan') {
		const result = list(data.results)[0] ?? {};
		content = str(result.outputText);
		tokens = usage(data.inputTextTokenCount, result.tokenCount);
	} else if (protocol === 'vertex') {
		const chunk = sapLineParser('vertex')(raw);
		content = chunk.content ?? '';
		toolCalls = chunk.toolCalls ?? [];
		tokens = chunk.usage;
	} else {
		const message = obj(list(data.choices)[0]?.message);
		content = str(message.content);
		toolCalls = list(message.tool_calls).map(tool => { const fn = obj(tool.function); return call(tool.id, fn.name, fn.arguments); });
		const meta = obj(data.usage);
		tokens = usage(meta.prompt_tokens, meta.completion_tokens, meta.total_tokens);
	}
	if (content || toolCalls.length) onChunk({ content, done: false, toolCalls: toolCalls.length ? toolCalls : undefined });
	onChunk({ content: '', done: true, usage: tokens });
}
