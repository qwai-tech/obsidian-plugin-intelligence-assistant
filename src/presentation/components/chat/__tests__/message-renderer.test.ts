/**
 * MessageRenderer Tests
 * Comprehensive test suite for message rendering functionality
 */

import { MessageRenderer } from '../message-renderer';
import { Message, RAGSource, WebSearchResult } from '@/types';
import { LLMConfig } from '@/types';
import { App } from 'obsidian';

// Mock Obsidian App
const mockApp = {
	vault: {
		getAbstractFileByPath: jest.fn(),
	},
	workspace: {
		getLeaf: jest.fn(() => ({
			openFile: jest.fn(),
		})),
	},
} as unknown as App;

// Mock LLM Configs
const mockConfigs: LLMConfig[] = [
	{
		provider: 'openai',
		apiKey: 'test-key',
		baseUrl: 'https://api.openai.com',
	},
	{
		provider: 'anthropic',
		apiKey: 'test-key',
		baseUrl: 'https://api.anthropic.com',
	},
	{
		provider: 'google',
		apiKey: 'test-key',
		baseUrl: 'https://generativelanguage.googleapis.com',
	},
	{
		provider: 'ollama',
		baseUrl: 'http://localhost:11434',
	},
];

// Helper to create a DOM container for tests
function createContainer(): HTMLElement {
	return document.createElement('div');
}

describe('MessageRenderer', () => {
	let renderer: MessageRenderer;
	let container: HTMLElement;

	beforeEach(() => {
		renderer = new MessageRenderer(mockApp, mockConfigs);
		container = createContainer();
	});

	describe('Basic Message Rendering', () => {
		it('should render a user message', () => {
			const message: Message = {
				role: 'user',
				content: 'Hello, world!',
			};

			const messageEl = renderer.renderMessage(container, message);

			expect(messageEl).toBeTruthy();
			expect(messageEl.classList.contains('chat-message')).toBe(true);
			expect(messageEl.classList.contains('message-user')).toBe(true);
			expect(messageEl.textContent).toContain('Hello, world!');
			expect(messageEl.textContent).toContain('You');
		});

		it('should render an assistant message', () => {
			const message: Message = {
				role: 'assistant',
				content: 'I can help you with that.',
				model: 'openai:gpt-4',
			};

			const messageEl = renderer.renderMessage(container, message);

			expect(messageEl).toBeTruthy();
			expect(messageEl.classList.contains('message-assistant')).toBe(true);
			expect(messageEl.textContent).toContain('I can help you with that.');
		});

		it('should include timestamp', () => {
			const message: Message = {
				role: 'user',
				content: 'Test message',
			};

			const messageEl = renderer.renderMessage(container, message);
			const timestamp = messageEl.querySelector('.message-timestamp');

			expect(timestamp).toBeTruthy();
			expect(timestamp?.textContent).toMatch(/\d{1,2}:\d{2}/); // HH:MM format
		});
	});

	describe('Provider-Specific Features', () => {
		it('should display OpenAI provider avatar and color', () => {
			const message: Message = {
				role: 'assistant',
				content: 'Response from GPT-4',
				model: 'openai:gpt-4',
			};

			const messageEl = renderer.renderMessage(container, message);
			const avatar = messageEl.querySelector('.message-avatar') as HTMLElement;

			expect(avatar).toBeTruthy();
			expect(avatar.style.background).toBe('rgb(16, 163, 127)'); // #10a37f
			expect(avatar.innerHTML).toContain('svg');
		});

		it('should display Anthropic provider avatar and color', () => {
			const message: Message = {
				role: 'assistant',
				content: 'Response from Claude',
				model: 'anthropic:claude-3-opus',
			};

			const messageEl = renderer.renderMessage(container, message);
			const avatar = messageEl.querySelector('.message-avatar') as HTMLElement;

			expect(avatar).toBeTruthy();
			expect(avatar.style.background).toBe('rgb(217, 119, 87)'); // #d97757
		});

		it('should display Google provider avatar and color', () => {
			const message: Message = {
				role: 'assistant',
				content: 'Response from Gemini',
				model: 'google:gemini-pro',
			};

			const messageEl = renderer.renderMessage(container, message);
			const avatar = messageEl.querySelector('.message-avatar') as HTMLElement;

			expect(avatar).toBeTruthy();
			expect(avatar.style.background).toBe('rgb(66, 133, 244)'); // #4285f4
		});

		it('should display Ollama provider avatar and color', () => {
			const message: Message = {
				role: 'assistant',
				content: 'Response from Llama',
				model: 'ollama:llama2',
			};

			const messageEl = renderer.renderMessage(container, message);
			const avatar = messageEl.querySelector('.message-avatar') as HTMLElement;

			expect(avatar).toBeTruthy();
			expect(avatar.style.background).toBe('rgb(139, 92, 246)'); // #8b5cf6
		});

		it('should show provider and model name in header', () => {
			const message: Message = {
				role: 'assistant',
				content: 'Test response',
				model: 'openai:gpt-4',
			};

			const messageEl = renderer.renderMessage(container, message);
			const nameEl = messageEl.querySelector('.message-name');

			expect(nameEl?.textContent).toContain('Openai');
			expect(nameEl?.textContent).toContain('gpt-4');
		});

		it('should show "Assistant" when no model is specified', () => {
			const message: Message = {
				role: 'assistant',
				content: 'Test response',
			};

			const messageEl = renderer.renderMessage(container, message);
			const nameEl = messageEl.querySelector('.message-name');

			expect(nameEl?.textContent).toBe('Assistant');
		});
	});

	describe('Markdown Rendering', () => {
		it('should render markdown in assistant messages', () => {
			const message: Message = {
				role: 'assistant',
				content: '# Heading\n\n**Bold text** and *italic text*',
			};

			const messageEl = renderer.renderMessage(container, message);
			const contentEl = messageEl.querySelector('.message-content');

			expect(contentEl?.innerHTML).toContain('<h1>');
			expect(contentEl?.innerHTML).toContain('<strong>');
			expect(contentEl?.innerHTML).toContain('<em>');
		});

		it('should render plain text for user messages', () => {
			const message: Message = {
				role: 'user',
				content: '# This is not rendered as markdown',
			};

			const messageEl = renderer.renderMessage(container, message);
			const contentEl = messageEl.querySelector('.message-content');

			expect(contentEl?.innerHTML).not.toContain('<h1>');
			expect(contentEl?.textContent).toBe('# This is not rendered as markdown');
		});

		it('should handle excessive newlines in markdown', () => {
			const message: Message = {
				role: 'assistant',
				content: 'Line 1\n\n\n\n\nLine 2',
			};

			const messageEl = renderer.renderMessage(container, message);
			const contentEl = messageEl.querySelector('.message-content');

			// Should clean up to max 2 newlines
			expect(contentEl?.innerHTML).not.toContain('\n\n\n');
		});
	});

	describe('Attachments', () => {
		it('should render file attachments', () => {
			const message: Message = {
				role: 'user',
				content: 'Check this file',
				attachments: [
					{
						type: 'file',
						name: 'document.pdf',
						path: '/documents/document.pdf',
						content: 'file content',
					},
				],
			};

			const messageEl = renderer.renderMessage(container, message);
			const attachmentEl = messageEl.querySelector('.attachment-item');

			expect(attachmentEl).toBeTruthy();
			expect(attachmentEl?.textContent).toContain('📎');
			expect(attachmentEl?.textContent).toContain('document.pdf');
		});

		it('should render image attachments', () => {
			const message: Message = {
				role: 'user',
				content: 'Check this image',
				attachments: [
					{
						type: 'image',
						name: 'photo.jpg',
						path: '/images/photo.jpg',
						content: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
					},
				],
			};

			const messageEl = renderer.renderMessage(container, message);
			const img = messageEl.querySelector('img');

			expect(img).toBeTruthy();
			expect(img?.src).toBe('data:image/jpeg;base64,/9j/4AAQSkZJRg...');
			expect(img?.alt).toBe('photo.jpg');
		});

		it('should render multiple attachments', () => {
			const message: Message = {
				role: 'user',
				content: 'Multiple files',
				attachments: [
					{
						type: 'file',
						name: 'file1.txt',
						path: '/file1.txt',
						content: 'content1',
					},
					{
						type: 'file',
						name: 'file2.txt',
						path: '/file2.txt',
						content: 'content2',
					},
				],
			};

			const messageEl = renderer.renderMessage(container, message);
			const attachments = messageEl.querySelectorAll('.attachment-item');

			expect(attachments.length).toBe(2);
		});
	});

	describe('Reference Badges', () => {
		it('should render file references', () => {
			const message: Message = {
				role: 'user',
				content: 'Test with reference',
				references: [
					{
						type: 'file',
						path: '/notes/example.md',
						name: 'example.md',
					},
				],
			};

			const messageEl = renderer.renderMessage(container, message);
			const refBadge = messageEl.querySelector('.reference-badge');

			expect(refBadge).toBeTruthy();
			expect(refBadge?.innerHTML).toContain('📄');
			expect(refBadge?.innerHTML).toContain('/notes/example.md');
		});

		it('should render folder references', () => {
			const message: Message = {
				role: 'user',
				content: 'Test with folder reference',
				references: [
					{
						type: 'folder',
						path: '/notes',
						name: 'notes',
					},
				],
			};

			const messageEl = renderer.renderMessage(container, message);
			const refBadge = messageEl.querySelector('.reference-badge');

			expect(refBadge?.innerHTML).toContain('📁');
			expect(refBadge?.innerHTML).toContain('/notes');
		});
	});

	describe('RAG Sources', () => {
		it('should display RAG sources for assistant messages', () => {
			const ragSources: RAGSource[] = [
				{
					path: '/notes/source1.md',
					title: 'Source Document 1',
					content: 'This is the content of the first source document.',
					similarity: 0.85,
				},
				{
					path: '/notes/source2.md',
					title: 'Source Document 2',
					content: 'This is the content of the second source document.',
					similarity: 0.72,
				},
			];

			const message: Message = {
				role: 'assistant',
				content: 'Answer based on documents',
				ragSources,
			};

			const messageEl = renderer.renderMessage(container, message);
			const ragContainer = messageEl.querySelector('.rag-sources-container');
			const sourceCards = messageEl.querySelectorAll('.rag-source-card');

			expect(ragContainer).toBeTruthy();
			expect(sourceCards.length).toBe(2);
		});

		it('should display similarity percentages', () => {
			const ragSources: RAGSource[] = [
				{
					path: '/notes/source.md',
					title: 'High Similarity',
					content: 'Content',
					similarity: 0.95,
				},
			];

			const message: Message = {
				role: 'assistant',
				content: 'Answer',
				ragSources,
			};

			const messageEl = renderer.renderMessage(container, message);
			const similarityEl = messageEl.querySelector('.rag-source-similarity');

			expect(similarityEl?.textContent).toBe('95%');
		});

		it('should color-code similarity scores', () => {
			const testCases = [
				{ similarity: 0.9, expectedColor: 'var(--text-success)' },
				{ similarity: 0.7, expectedColor: 'var(--text-accent)' },
				{ similarity: 0.5, expectedColor: 'var(--text-muted)' },
			];

			testCases.forEach(({ similarity, expectedColor }) => {
				const message: Message = {
					role: 'assistant',
					content: 'Answer',
					ragSources: [
						{
							path: '/test.md',
							title: 'Test',
							content: 'Content',
							similarity,
						},
					],
				};

				const messageEl = renderer.renderMessage(container, message);
				const similarityEl = messageEl.querySelector('.rag-source-similarity') as HTMLElement;

				expect(similarityEl.style.color).toBe(expectedColor);
			});
		});

		it('should truncate long content previews', () => {
			const longContent = 'a'.repeat(200);
			const ragSources: RAGSource[] = [
				{
					path: '/notes/source.md',
					title: 'Long Source',
					content: longContent,
					similarity: 0.8,
				},
			];

			const message: Message = {
				role: 'assistant',
				content: 'Answer',
				ragSources,
			};

			const messageEl = renderer.renderMessage(container, message);
			const contentEl = messageEl.querySelector('.rag-source-content');

			expect(contentEl?.textContent?.length).toBeLessThanOrEqual(154); // 150 + '...'
			expect(contentEl?.textContent).toContain('...');
		});
	});

	describe('Web Search Results', () => {
		it('should display web search results', () => {
			const results: WebSearchResult[] = [
				{
					title: 'Search Result 1',
					url: 'https://example.com/page1',
					snippet: 'This is the first search result',
					source: 'example.com',
				},
				{
					title: 'Search Result 2',
					url: 'https://example.com/page2',
					snippet: 'This is the second search result',
					source: 'example.com',
				},
			];

			const message: Message = {
				role: 'assistant',
				content: 'Answer based on web search',
				webSearchResults: results,
			};

			const messageEl = renderer.renderMessage(container, message);
			const resultsContainer = messageEl.querySelector('.web-results-container');
			const resultCards = messageEl.querySelectorAll('.web-result-card');

			expect(resultsContainer).toBeTruthy();
			expect(resultCards.length).toBe(2);
		});

		it('should display provider attribution', () => {
			const results: WebSearchResult[] = [
				{
					title: 'Result',
					url: 'https://example.com',
					snippet: 'Snippet',
					source: 'example.com',
				},
			];

			const message: Message = {
				role: 'assistant',
				content: 'Answer',
				webSearchResults: results,
				webSearchProvider: 'google',
			};

			const messageEl = renderer.renderMessage(container, message);
			const header = messageEl.querySelector('.web-results-header');

			expect(header?.innerHTML).toContain('Google');
		});

		it('should render result rankings', () => {
			const results: WebSearchResult[] = [
				{
					title: 'First Result',
					url: 'https://example.com/1',
					snippet: 'First',
					source: 'example.com',
				},
				{
					title: 'Second Result',
					url: 'https://example.com/2',
					snippet: 'Second',
					source: 'example.com',
				},
			];

			const message: Message = {
				role: 'assistant',
				content: 'Answer',
				webSearchResults: results,
			};

			const messageEl = renderer.renderMessage(container, message);
			const ranks = messageEl.querySelectorAll('.web-result-rank');

			expect(ranks[0]?.textContent).toBe('1');
			expect(ranks[1]?.textContent).toBe('2');
		});

		it('should make titles clickable with correct URLs', () => {
			const results: WebSearchResult[] = [
				{
					title: 'Clickable Result',
					url: 'https://example.com/article',
					snippet: 'Article snippet',
					source: 'example.com',
				},
			];

			const message: Message = {
				role: 'assistant',
				content: 'Answer',
				webSearchResults: results,
			};

			const messageEl = renderer.renderMessage(container, message);
			const titleLink = messageEl.querySelector('.web-result-title') as HTMLAnchorElement;

			expect(titleLink).toBeTruthy();
			expect(titleLink.href).toBe('https://example.com/article');
			expect(titleLink.target).toBe('_blank');
		});
	});

	describe('Agent Mode', () => {
		it('should extract final answer from agent execution', () => {
			const message: Message = {
				role: 'assistant',
				content: 'Thought: I need to analyze this\n\nThe answer is 42.\n\nAction: done',
				agentExecutionSteps: [
					{ type: 'thought', content: 'Analyzing', timestamp: Date.now() },
				],
			};

			const messageEl = renderer.renderMessage(container, message, 'agent');
			const finalAnswer = messageEl.querySelector('.agent-final-answer');

			expect(finalAnswer).toBeTruthy();
			expect(finalAnswer?.textContent).toContain('The answer is 42');
			expect(finalAnswer?.textContent).not.toContain('Thought:');
			expect(finalAnswer?.textContent).not.toContain('Action:');
		});

		it('should remove tool call JSON blocks', () => {
			const message: Message = {
				role: 'assistant',
				content: 'Let me search.\n\n```json\n{"tool": "search", "query": "test"}\n```\n\nHere is the result.',
				agentExecutionSteps: [
					{ type: 'action', content: 'Searching', timestamp: Date.now() },
				],
			};

			const messageEl = renderer.renderMessage(container, message, 'agent');
			const finalAnswer = messageEl.querySelector('.agent-final-answer');

			expect(finalAnswer?.textContent).not.toContain('```json');
			expect(finalAnswer?.textContent).toContain('Here is the result');
		});

		it('should render final answer as markdown', () => {
			const message: Message = {
				role: 'assistant',
				content: '# Final Answer\n\n**Important:** The result is correct.',
				agentExecutionSteps: [
					{ type: 'thought', content: 'Processing', timestamp: Date.now() },
				],
			};

			const messageEl = renderer.renderMessage(container, message, 'agent');
			const finalAnswer = messageEl.querySelector('.agent-final-answer');

			expect(finalAnswer?.innerHTML).toContain('<h1>');
			expect(finalAnswer?.innerHTML).toContain('<strong>');
		});
	});

	describe('Streaming Updates', () => {
		it('should update streaming message content', () => {
			const message: Message = {
				role: 'assistant',
				content: 'Initial content',
			};

			const messageEl = renderer.renderMessage(container, message);
			renderer.updateStreamingMessage(messageEl, 'Updated content');

			const contentEl = messageEl.querySelector('.message-content');
			expect(contentEl?.textContent).toContain('Updated content');
		});

		it('should render markdown in streaming updates', () => {
			const message: Message = {
				role: 'assistant',
				content: 'Initial',
			};

			const messageEl = renderer.renderMessage(container, message);
			renderer.updateStreamingMessage(messageEl, '**Bold** content');

			const contentEl = messageEl.querySelector('.message-content');
			expect(contentEl?.innerHTML).toContain('<strong>');
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty message content', () => {
			const message: Message = {
				role: 'user',
				content: '',
			};

			const messageEl = renderer.renderMessage(container, message);
			expect(messageEl).toBeTruthy();
		});

		it('should handle messages with no attachments or sources', () => {
			const message: Message = {
				role: 'assistant',
				content: 'Simple message',
			};

			const messageEl = renderer.renderMessage(container, message);
			expect(messageEl.querySelector('.message-attachments')).toBeNull();
			expect(messageEl.querySelector('.rag-sources-container')).toBeNull();
			expect(messageEl.querySelector('.web-results-container')).toBeNull();
		});

		it('should handle unknown provider gracefully', () => {
			const message: Message = {
				role: 'assistant',
				content: 'Response from unknown provider',
				model: 'unknown:model',
			};

			const messageEl = renderer.renderMessage(container, message);
			const avatar = messageEl.querySelector('.message-avatar') as HTMLElement;

			expect(avatar).toBeTruthy();
			// Should use default color
			expect(avatar.style.background).toBe('var(--interactive-accent)');
		});

		it('should handle invalid markdown gracefully', () => {
			const message: Message = {
				role: 'assistant',
				content: '```\nUnclosed code block',
			};

			const messageEl = renderer.renderMessage(container, message);
			expect(messageEl).toBeTruthy();
			// Should still render something (either as HTML or fallback to text)
		});
	});
});
