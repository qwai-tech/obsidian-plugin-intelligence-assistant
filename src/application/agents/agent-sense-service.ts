import type { App, TAbstractFile } from 'obsidian';
import { TFile, TFolder } from 'obsidian';
import type { FileReference, RAGSource } from '@/types';
import type { RAGManager } from '@/infrastructure/rag-manager';
import { buildObsidianContextSnapshot } from '@/application/services/obsidian-context-builder';
import type { AgentMemorySnapshot, AgentContextSection, AgentSenseContext } from './types';

interface AgentMemoryReader {
	getSnapshot(agentId: string): Promise<AgentMemorySnapshot>;
}

interface SenseInput {
	userQuery: string;
	model: string;
	defaultModel?: string;
	enableRAG?: boolean;
	agentId?: string;
	references?: FileReference[];
}

type AppWithResolvedLinks = App & {
	metadataCache: App['metadataCache'] & {
		resolvedLinks?: Record<string, Record<string, number>>;
	};
};

const MAX_GRAPH_NEIGHBORS = 8;

export class AgentSenseService {
	constructor(
		private readonly app: App,
		private readonly ragManager: RAGManager,
		private readonly memoryService?: AgentMemoryReader,
	) {}

	async sense(input: SenseInput): Promise<AgentSenseContext> {
		const sections: AgentContextSection[] = [];
		const activeFile = this.app.workspace.getActiveFile();
		const references = input.references ?? [];

		if (activeFile instanceof TFile) {
			const activeSnapshot = await buildObsidianContextSnapshot(this.app, [activeFile], { maxFileChars: 12000 });
			if (activeSnapshot.trim()) {
				sections.push({ title: 'Active note', content: activeSnapshot, source: 'active-note', path: activeFile.path });
			}

			const graphNeighbors = this.getGraphNeighbors(activeFile);
			if (graphNeighbors.length > 0) {
				const graphSnapshot = await buildObsidianContextSnapshot(this.app, graphNeighbors, { maxFileChars: 4000 });
				if (graphSnapshot.trim()) {
					sections.push({ title: 'Graph neighbors', content: graphSnapshot, source: 'graph-neighbor' });
				}
			}
		}

		const referenceFiles = this.resolveReferences(references);
		if (referenceFiles.length > 0) {
			const referenceSnapshot = await buildObsidianContextSnapshot(this.app, referenceFiles, { maxFileChars: 8000 });
			if (referenceSnapshot.trim()) {
				sections.push({ title: 'Explicit references', content: referenceSnapshot, source: 'reference' });
			}
		}

		const ragSources = await this.queryRag(input);
		if (ragSources.length > 0) {
			sections.push({
				title: 'RAG context',
				content: ragSources.map(source => `Document: ${source.path}\nContent: ${source.content}`).join('\n\n'),
				source: 'rag',
			});
		}

		const memory = input.agentId && this.memoryService
			? await this.memoryService.getSnapshot(input.agentId)
			: null;
		if (memory) {
			sections.push({
				title: 'Agent memory',
				content: [
					`Research Log:\n${memory.researchLog || '(empty)'}`,
					`Working Notes:\n${memory.workingNotes.map(note => `- ${note}`).join('\n') || '(empty)'}`,
					`Preferences:\n${Object.entries(memory.preferences).map(([key, value]) => `- ${key}: ${value}`).join('\n') || '(empty)'}`,
				].join('\n\n'),
				source: 'memory',
			});
		}

		return {
			userQuery: input.userQuery,
			activeFilePath: activeFile instanceof TFile ? activeFile.path : null,
			references,
			sections,
			ragSources,
			memory,
		};
	}

	formatSenseContext(context: AgentSenseContext): string {
		if (context.sections.length === 0) {
			return 'No Obsidian context was available for this request.';
		}
		return [
			'## Vault-Aware Sense Context',
			`User request: ${context.userQuery}`,
			context.activeFilePath ? `Active file: [[${context.activeFilePath}]]` : 'Active file: none',
			'',
			...context.sections.map(section => `### ${section.title}\n${section.content}`),
		].join('\n');
	}

	private async queryRag(input: SenseInput): Promise<RAGSource[]> {
		if (!input.enableRAG) return [];
		const results = await this.ragManager.query(input.userQuery, input.model, input.defaultModel);
		return results.map(result => ({
			path: result.chunk.metadata.path,
			content: result.chunk.content,
			similarity: result.similarity,
			title: result.chunk.metadata.title,
		}));
	}

	private resolveReferences(references: FileReference[]): Array<TFile | TFolder> {
		const resolved: Array<TFile | TFolder> = [];
		for (const reference of references) {
			const file = this.app.vault.getAbstractFileByPath(reference.path);
			if (file instanceof TFile || file instanceof TFolder) {
				resolved.push(file);
			}
		}
		return resolved;
	}

	private getGraphNeighbors(file: TFile): TFile[] {
		const app = this.app as AppWithResolvedLinks;
		const cache = app.metadataCache.getFileCache(file);
		const outgoing = (cache?.links ?? [])
			.map(link => link.link ?? '')
			.filter(Boolean);
		const backlinks = Object.entries(app.metadataCache.resolvedLinks ?? {})
			.filter(([, targets]) => Boolean(targets[file.path]))
			.map(([sourcePath]) => sourcePath);

		const paths = Array.from(new Set([...outgoing, ...backlinks])).slice(0, MAX_GRAPH_NEIGHBORS);
		return paths
			.map(path => this.app.vault.getAbstractFileByPath(path))
			.filter((candidate: TAbstractFile | null): candidate is TFile => candidate instanceof TFile);
	}
}
