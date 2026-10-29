import type { StreamChunk } from '../types';

export type SapProtocol = 'openai' | 'vertex' | 'bedrock-claude' | 'bedrock-converse';

export interface SapLine {
	content?: string;
	done?: boolean;
	usage?: StreamChunk['usage'];
}

type LineParser = (data: unknown) => SapLine;

interface OpenAiLine {
	choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
	usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

interface VertexLine {
	candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
}

interface ClaudeLine {
	type?: string;
	delta?: { text?: string };
	content_block?: { text?: string };
}

interface ConverseLine {
	contentBlockDelta?: { delta?: { text?: string } };
	messageStop?: unknown;
}

const PARSERS: Record<SapProtocol, LineParser> = {
	openai: (data) => {
		const line = data as OpenAiLine;
		const choice = line.choices?.[0];
		const usage = line.usage
			? { promptTokens: line.usage.prompt_tokens ?? 0, completionTokens: line.usage.completion_tokens ?? 0, totalTokens: line.usage.total_tokens ?? 0 }
			: undefined;
		return { content: choice?.delta?.content, done: Boolean(choice?.finish_reason), usage };
	},
	vertex: (data) => {
		const candidate = (data as VertexLine).candidates?.[0];
		return { content: candidate?.content?.parts?.[0]?.text, done: Boolean(candidate?.finishReason) };
	},
	'bedrock-claude': (data) => {
		const line = data as ClaudeLine;
		return { content: line.delta?.text || line.content_block?.text, done: line.type === 'message_stop' || line.type === 'content_block_stop' };
	},
	'bedrock-converse': (data) => {
		const line = data as ConverseLine;
		return { content: line.contentBlockDelta?.delta?.text, done: Boolean(line.messageStop) };
	},
};

export function sapLineParser(protocol: SapProtocol): LineParser {
	return PARSERS[protocol];
}

export function emitBufferedSse(text: string, parse: LineParser, onChunk: (chunk: StreamChunk) => void): void {
	for (const line of text.split('\n')) {
		if (!line.startsWith('data: ')) continue;
		const data = line.slice(6).trim();
		if (data === '[DONE]') {
			onChunk({ content: '', done: true });
			return;
		}
		let parsed: SapLine;
		try {
			parsed = parse(JSON.parse(data));
		} catch (error) {
			console.error('[SAP AI Core] Failed to parse SSE chunk:', error, 'Data:', data);
			continue;
		}
		if (parsed.content) {
			onChunk({ content: parsed.content, done: false });
		}
		if (parsed.done) {
			onChunk(parsed.usage ? { content: '', done: true, usage: parsed.usage } : { content: '', done: true });
			return;
		}
	}
	onChunk({ content: '', done: true });
}

type CompletionProtocol = SapProtocol | 'bedrock-titan';

const COMPLETIONS: Record<CompletionProtocol, (json: unknown) => string | undefined> = {
	openai: (json) => (json as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content,
	vertex: (json) => (json as VertexLine).candidates?.[0]?.content?.parts?.[0]?.text,
	'bedrock-claude': (json) => (json as { content?: Array<{ text?: string }> }).content?.[0]?.text,
	'bedrock-titan': (json) => (json as { results?: Array<{ outputText?: string }> }).results?.[0]?.outputText,
	'bedrock-converse': (json) => (json as { output?: { message?: { content?: Array<{ text?: string }> } } }).output?.message?.content?.[0]?.text,
};

export function completionText(protocol: CompletionProtocol, json: unknown): string {
	return COMPLETIONS[protocol](json) ?? '';
}

export function emitCompletion(text: string, onChunk: (chunk: StreamChunk) => void): void {
	if (text) {
		onChunk({ content: text, done: false });
	}
	onChunk({ content: '', done: true });
}
