import {
	appendTokenUsageToMessage,
	renderAssistantMarkdown,
	renderMessage,
	type MessageRendererContext,
} from '../message-renderer';
import { initI18n } from '@/i18n';
import type { Message, RAGSource, WebSearchResult } from '@/types';

const mockContext: MessageRendererContext = {
	app: {} as MessageRendererContext['app'],
	plugin: {
		settings: {
			llmConfigs: [
				{ provider: 'openai', models: ['openai:gpt-4o'] },
				{ provider: 'anthropic', models: ['anthropic:claude-3-5-sonnet'] },
			],
		},
	} as MessageRendererContext['plugin'],
	mode: 'chat',
	messages: [],
};

function render(message: Message, context: MessageRendererContext = mockContext) {
	const container = document.createElement('div');
	const messageEl = renderMessage(container, message, context);
	return { container, messageEl };
}

describe('renderMessage', () => {
	beforeAll(() => {
		initI18n('en');
	});

	describe('basic message shell', () => {
		it('renders a user message with stable classes, role metadata, and timestamp', () => {
			const { container, messageEl } = render({
				role: 'user',
				content: 'Hello, world!',
			});

			expect(container.children).toHaveLength(1);
			expect(messageEl.classList.contains('chat-message')).toBe(true);
			expect(messageEl.classList.contains('message-user')).toBe(true);
			expect(messageEl.getAttribute('data-role')).toBe('user');
			expect(messageEl.querySelector('.message-name')?.textContent).toBe('You');
			expect(messageEl.querySelector('.message-content')?.textContent).toBe('Hello, world!');
			expect(messageEl.querySelector('.message-timestamp')?.textContent).toMatch(/\d{1,2}:\d{2}/);
		});

		it('renders an assistant message with provider and model badges', () => {
			const { messageEl } = render({
				role: 'assistant',
				content: 'I can help.',
				model: 'openai:gpt-4o',
			});

			expect(messageEl.classList.contains('message-assistant')).toBe(true);
			expect(messageEl.querySelector('.message-name')?.textContent).toBe('Assistant');
			expect(messageEl.querySelector('.message-content')?.textContent).toContain('I can help.');
			expect(messageEl.querySelector('.message-avatar')?.getAttribute('title')).toBe('OpenAI');
			expect(messageEl.textContent).toContain('Model');
			expect(messageEl.textContent).toContain('gpt-4o');
			expect(messageEl.textContent).toContain('Provider');
			expect(messageEl.textContent).toContain('OpenAI');
		});

		it('falls back gracefully for unknown assistant providers', () => {
			const { messageEl } = render({
				role: 'assistant',
				content: 'Response from unknown provider',
				provider: 'unknown',
				model: 'unknown:model-x',
			});

			const avatar = messageEl.querySelector<HTMLElement>('.message-avatar');
			expect(avatar).toBeTruthy();
			expect(avatar?.getAttribute('title')).toBe('Unknown');
			expect(messageEl.textContent).toContain('model-x');
		});
	});

	describe('message content', () => {
		it('renders user content as plain text', () => {
			const { messageEl } = render({
				role: 'user',
				content: '<strong>not markdown</strong>',
			});

			const content = messageEl.querySelector('.message-content');
			expect(content?.textContent).toBe('<strong>not markdown</strong>');
			expect(content?.querySelector('strong')).toBeNull();
		});

		it('renders assistant content through the markdown pipeline', () => {
			const { messageEl } = render({
				role: 'assistant',
				content: '**Bold** response',
			});

			const content = messageEl.querySelector('.message-content');
			expect(content?.innerHTML).toContain('<p>');
			expect(content?.textContent).toContain('Bold');
		});

		it('exposes renderAssistantMarkdown for streaming-style updates', () => {
			const target = document.createElement('div');

			renderAssistantMarkdown(target, 'Updated **content**');

			expect(target.innerHTML).toContain('<p>');
			expect(target.textContent).toContain('Updated');
		});
	});

	describe('context sections', () => {
		it('renders attachments and references in list sections', () => {
			const { messageEl } = render({
				role: 'user',
				content: 'Use this context',
				attachments: [
					{
						type: 'file',
						name: 'brief.md',
						path: 'Project/brief.md',
						content: 'brief content',
					},
				],
				references: [
					{
						type: 'folder',
						name: 'Project',
						path: 'Project',
					},
				],
			});

			expect(messageEl.textContent).toContain('brief.md (Project/brief.md)');
			expect(messageEl.textContent).toContain('Project (Project)');
		});

		it('delegates RAG source rendering when a callback is provided', () => {
			const ragSources: RAGSource[] = [
				{
					path: 'Notes/source.md',
					title: 'Source Note',
					content: 'source content',
					similarity: 0.82,
				},
			];
			const message: Message = {
				role: 'assistant',
				content: 'Answer',
				ragSources,
			};
			const displayRagSources = jest.fn((container: HTMLElement) => {
				container.createDiv({ cls: 'mock-rag-source', text: 'Source Note' });
			});
			const container = document.createElement('div');

			const messageEl = renderMessage(container, message, mockContext, { displayRagSources });

			expect(displayRagSources).toHaveBeenCalledWith(expect.any(HTMLElement), message);
			expect(messageEl.querySelector('.mock-rag-source')?.textContent).toBe('Source Note');
		});

		it('renders fallback RAG and web search result sections', () => {
			const webSearchResults: WebSearchResult[] = [
				{
					title: 'Search Result',
					url: 'https://example.com/article',
					snippet: 'Article snippet',
					source: 'example.com',
				},
			];

			const { messageEl } = render({
				role: 'assistant',
				content: 'Answer',
				ragSources: [
					{
						path: 'Notes/source.md',
						title: 'Source Note',
						content: 'source content',
						similarity: 0.82,
					},
				],
				webSearchResults,
			});

			expect(messageEl.textContent).toContain('Source Note');
			expect(messageEl.textContent).toContain('Search Result');
			expect(messageEl.textContent).toContain('Article snippet');
			expect(messageEl.textContent).toContain('https://example.com/article');
		});
	});

	describe('agent and action affordances', () => {
		it('renders an execution trace when agent steps are present', () => {
			const { messageEl } = render({
				role: 'assistant',
				content: 'Final response',
				agentExecutionSteps: [
					{
						type: 'thought',
						content: 'Thinking through the task',
						timestamp: Date.now(),
						status: 'success',
					},
				],
			}, { ...mockContext, mode: 'agent' });

			expect(messageEl.textContent).toContain('Thinking through the task');
			expect(messageEl.textContent).toContain('Final response');
		});

		it('renders SPAR phase labels in agent traces', () => {
			const container = document.createElement('div');
			const message: Message = {
				role: 'assistant',
				content: 'Done',
				agentExecutionSteps: [
					{ type: 'thought', phase: 'sense', content: 'Sensed active note', timestamp: 1 },
					{ type: 'action', phase: 'act', content: 'read_file({"path":"A.md"})', toolName: 'read_file', args: { path: 'A.md' }, status: 'success', result: '"A"', timestamp: 2 },
				],
			};

			const messageEl = renderMessage(container, message, { ...mockContext, mode: 'agent' });

			expect(messageEl.textContent).toContain('Sense');
			expect(messageEl.textContent).toContain('Act');
		});

		it('renders assistant action buttons and invokes callbacks', () => {
			const saveMessageToNewNote = jest.fn().mockResolvedValue(undefined);
			const regenerateMessage = jest.fn().mockResolvedValue(undefined);
			const message: Message = {
				role: 'assistant',
				content: 'Actionable answer',
			};
			const container = document.createElement('div');

			const messageEl = renderMessage(container, message, mockContext, {
				saveMessageToNewNote,
				regenerateMessage,
			});
			const buttons = Array.from(messageEl.querySelectorAll<HTMLButtonElement>('.msg-action-btn'));

			expect(buttons.map(button => button.textContent)).toEqual(
				expect.arrayContaining(['Save', 'Regenerate'])
			);

			buttons.find(button => button.textContent === 'Save')?.click();
			buttons.find(button => button.textContent === 'Regenerate')?.click();

			expect(saveMessageToNewNote).toHaveBeenCalledWith(message);
			expect(regenerateMessage).toHaveBeenCalledWith(message, messageEl);
		});
	});

	describe('token usage footer', () => {
		it('renders and updates token usage annotations', () => {
			const { messageEl } = render({
				role: 'assistant',
				content: 'Tokenized answer',
				tokenUsage: {
					promptTokens: 10,
					completionTokens: 5,
					totalTokens: 15,
				},
			});

			expect(messageEl.querySelector('.ia-chat-message__footer')?.textContent).toContain('15');

			appendTokenUsageToMessage(messageEl, {
				promptTokens: 20,
				completionTokens: 10,
				totalTokens: 30,
			});

			expect(messageEl.querySelectorAll('.ia-chat-message__footer')).toHaveLength(1);
			expect(messageEl.querySelector('.ia-chat-message__footer')?.textContent).toContain('30');
		});
	});
});
