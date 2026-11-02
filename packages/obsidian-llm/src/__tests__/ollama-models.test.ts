import { OllamaProvider } from '../providers/ollama-provider';
import type { HttpPort, HttpRequest } from '../http';

function ollamaServer(shown: Record<string, string[] | null>): HttpPort {
	return {
		request: jest.fn(async (req: HttpRequest) => {
			if (req.url.endsWith('/api/tags')) {
				const body = JSON.stringify({ models: Object.keys(shown).map(name => ({ name })) });
				return { status: 200, ok: true, headers: {}, text: body, json: JSON.parse(body) as unknown };
			}
			const { model } = JSON.parse(String(req.body)) as { model: string };
			const capabilities = shown[model];
			if (!capabilities) return { status: 500, ok: false, headers: {}, text: 'boom', json: undefined };
			return { status: 200, ok: true, headers: {}, text: JSON.stringify({ capabilities }), json: { capabilities } };
		}),
		stream: jest.fn(),
	} as unknown as HttpPort;
}

describe('Ollama model capabilities', () => {
	it('takes capabilities from what Ollama reports for each model', async () => {
		const provider = new OllamaProvider({ provider: 'ollama', baseUrl: 'http://localhost:11434' }, ollamaServer({
			'qwen3.5:0.8b': ['completion', 'vision', 'thinking', 'tools'],
			'qwen3-embedding:4b': ['tools', 'embedding'],
		}));

		const models = await provider.fetchModels();

		expect(models.map(model => [model.id, model.capabilities])).toEqual([
			['ollama:qwen3.5:0.8b', ['chat', 'streaming', 'vision', 'reasoning', 'function_calling']],
			['ollama:qwen3-embedding:4b', ['embedding']],
		]);
	});

	it('falls back to guessing from the name when Ollama cannot describe a model', async () => {
		const provider = new OllamaProvider({ provider: 'ollama', baseUrl: 'http://localhost:11434' }, ollamaServer({ 'llava:7b': null }));

		const [model] = await provider.fetchModels();

		expect(model.capabilities).toEqual(['chat', 'streaming', 'vision', 'function_calling']);
	});
});
