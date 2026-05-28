import { TFile } from 'obsidian';
import { AgentSenseService } from '@/application/agents';

function makeFile(path: string): TFile {
	const file = new TFile();
	file.path = path;
	file.name = path.split('/').pop() ?? path;
	file.basename = file.name.replace(/\.md$/, '');
	file.extension = 'md';
	return file;
}

describe('AgentSenseService', () => {
	it('collects active note, graph neighbors, explicit references, RAG, and memory', async () => {
		const active = makeFile('Projects/AI.md');
		const neighbor = makeFile('Research/RAG.md');
		const reference = { type: 'file' as const, path: 'Inbox/Question.md', name: 'Question.md' };

		const app = {
			workspace: { getActiveFile: jest.fn(() => active) },
			vault: {
				getAbstractFileByPath: jest.fn((path: string) => path === neighbor.path ? neighbor : path === active.path ? active : makeFile(path)),
				cachedRead: jest.fn(async (file: TFile) => `# ${file.basename}\n\ncontent for ${file.path}`),
				read: jest.fn(async (file: TFile) => `# ${file.basename}\n\ncontent for ${file.path}`),
				getMarkdownFiles: jest.fn(() => [active, neighbor]),
			},
			metadataCache: {
				getFileCache: jest.fn((file: TFile) => file.path === active.path
					? { links: [{ link: 'Research/RAG.md' }], tags: [{ tag: '#agent' }] }
					: {}),
				resolvedLinks: {
					'Research/RAG.md': { 'Projects/AI.md': 1 },
				},
			},
		} as any;

		const ragManager = {
			query: jest.fn(async () => [{
				chunk: { content: 'retrieved context', metadata: { path: 'Research/RAG.md', title: 'RAG' } },
				similarity: 0.92,
			}]),
		} as any;

		const memoryService = {
			getSnapshot: jest.fn(async () => ({
				agentId: 'agent-1',
				workingNotes: ['Use short answers'],
				researchLog: 'Previous investigation',
				preferences: { citationStyle: 'wikilinks' },
				updatedAt: 100,
			})),
		};

		const service = new AgentSenseService(app, ragManager, memoryService as any);
		const context = await service.sense({
			userQuery: 'organize this project',
			model: 'gpt-4o',
			defaultModel: 'gpt-4o',
			enableRAG: true,
			agentId: 'agent-1',
			references: [reference],
		});

		expect(context.activeFilePath).toBe('Projects/AI.md');
		expect(context.sections.map(s => s.source)).toEqual(expect.arrayContaining(['active-note', 'graph-neighbor', 'reference', 'rag', 'memory']));
		expect(context.ragSources[0].path).toBe('Research/RAG.md');
		expect(context.memory?.researchLog).toContain('Previous investigation');
	});
});
