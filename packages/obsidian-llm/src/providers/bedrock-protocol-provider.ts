import { BaseLLMProvider } from '../base-provider';
import type { ChatRequest, ChatResponse, StreamChunk } from '../types';
import { convertAnthropicMessages } from './anthropic-provider';
import { emitSAPCompletion } from './sap-sse';

/** SAP's Bedrock JSON protocols. Streaming callers receive a genuine buffered completion. */
export class BedrockProtocolProvider extends BaseLLMProvider {
	get name(): string { return 'SAP Bedrock'; }
	async chat(request: ChatRequest): Promise<ChatResponse> {
		const name = request.model.toLowerCase();
		const protocol = name.includes('claude') ? 'bedrock-claude' : name.includes('titan') ? 'bedrock-titan' : 'bedrock-converse';
		if (protocol === 'bedrock-titan' && request.tools?.length) throw new Error('Titan does not support tool calls');
		const body = protocol === 'bedrock-claude' ? this.buildClaudeRequestBody(request) : protocol === 'bedrock-converse' ? this.buildConverseRequestBody(request) : {
			inputText: request.messages.map(message => message.content).join('\n'),
			textGenerationConfig: { maxTokenCount: request.maxTokens ?? 2000, temperature: request.temperature ?? 0.7, topP: request.topP ?? 1, stopSequences: request.stopSequences ?? [] },
		};
		const response = await this.http.request({ url: `${this.config.baseUrl ?? ''}/${protocol === 'bedrock-converse' ? 'converse' : 'invoke'}`, method: 'POST', headers: this.getHeaders(), body: JSON.stringify(body), signal: request.signal, retry: 'never' });
		if (!response.ok) throw new Error(`SAP Bedrock request failed: HTTP ${response.status}`);
		const result: ChatResponse = { content: '' };
		emitSAPCompletion(protocol, response.json, chunk => { result.content += chunk.content; if (chunk.toolCalls) result.toolCalls = [...result.toolCalls ?? [], ...chunk.toolCalls]; if (chunk.usage) result.usage = chunk.usage; });
		if (!result.content && !result.toolCalls?.length) throw new Error('SAP Bedrock returned no completion');
		return result;
	}
	async streamChat(request: ChatRequest, onChunk: (chunk: StreamChunk) => void): Promise<void> {
		const response = await this.chat(request);
		request.signal?.throwIfAborted();
		onChunk({ ...response, done: false });
		onChunk({ content: '', done: true, usage: response.usage });
	}
	private buildClaudeRequestBody(request: ChatRequest): Record<string, unknown> {
		const converted = convertAnthropicMessages(request.messages);
		const body: Record<string, unknown> = {
			anthropic_version: 'bedrock-2023-05-31',
			max_tokens: request.maxTokens ?? 2000,
			messages: converted.messages,
		};
		if (converted.system) body.system = converted.system;
		if (request.responseFormat && request.responseFormat.type !== 'text') {
			body.system = [converted.system, 'Respond with valid JSON only.', request.responseFormat.json_schema ? `JSON schema: ${JSON.stringify(request.responseFormat.json_schema.schema)}` : ''].filter(Boolean).join('\n\n');
		}

		// Sampling parameters
		if (request.temperature !== undefined) {
			body.temperature = request.temperature;
		} else {
			body.temperature = 0.7;
		}
		if (request.topP !== undefined) body.top_p = request.topP;
		if (request.topK !== undefined) body.top_k = request.topK;
		if (request.stopSequences !== undefined) body.stop_sequences = request.stopSequences;

		// Tools (function calling) — convert OpenAI format to Anthropic format
		if (request.tools?.length) {
			body.tools = request.tools.map(t => ({
				name: t.function.name,
				description: t.function.description,
				input_schema: t.function.parameters ?? { type: 'object', properties: {} },
			}));
		}
		if (request.toolChoice !== undefined) {
			if (request.toolChoice === 'auto') body.tool_choice = { type: 'auto' };
			else if (request.toolChoice === 'none') body.tool_choice = { type: 'none' };
			else if (request.toolChoice === 'required') body.tool_choice = { type: 'any' };
			else if (typeof request.toolChoice === 'object') {
				body.tool_choice = { type: 'tool', name: request.toolChoice.function.name };
			}
		}

		// Metadata
		if (request.user !== undefined) {
			body.metadata = { user_id: request.user };
		}

		return body;
	}

	/**
	 * Build Bedrock Converse request body for /converse or /invoke-with-response-stream
	 * Used for Nova Premier and other Bedrock models
	 * Supports: system, messages, tools, inferenceConfig
	 */
	private buildConverseRequestBody(request: ChatRequest): Record<string, unknown> {
		const converted = convertAnthropicMessages(request.messages);

		const inferenceConfig: Record<string, unknown> = {
			maxTokens: request.maxTokens ?? 2000,
			temperature: request.temperature ?? 0.7,
			stopSequences: request.stopSequences ?? [],
		};
		if (request.topP !== undefined) inferenceConfig.topP = request.topP;

		const body: Record<string, unknown> = {
			inferenceConfig,
			messages: converted.messages.map(message => ({
				role: message.role,
				content: typeof message.content === 'string' ? [{ text: message.content }] : message.content.map(block => {
					if (block.type === 'tool_use') return { toolUse: { toolUseId: block.id, name: block.name, input: block.input } };
					if (block.type === 'tool_result') return { toolResult: { toolUseId: block.tool_use_id, content: [{ text: block.content }] } };
					if (block.type === 'image') {
						const source = block.source as { media_type: string; data: string };
						return { image: { format: source.media_type.split('/')[1], source: { bytes: source.data } } };
					}
					return { text: block.text };
				}),
			})),
		};

		// System prompt
		if (converted.system) body.system = [{ text: converted.system }];

		// Tools (function calling) — convert OpenAI format to Converse toolConfig
		if (request.tools?.length && request.toolChoice !== 'none') {
			body.toolConfig = {
				tools: request.tools.map(t => ({
					toolSpec: {
						name: t.function.name,
						description: t.function.description,
						inputSchema: {
							json: t.function.parameters ?? { type: 'object', properties: {} },
						},
					},
				})),
				toolChoice: typeof request.toolChoice === 'object' ? { tool: { name: request.toolChoice.function.name } } : request.toolChoice === 'required' ? { any: {} } : { auto: {} },
			};
		}

		return body;
	}

}
