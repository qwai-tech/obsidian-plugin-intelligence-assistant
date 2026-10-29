import type { App } from 'obsidian';
import { TFile, TFolder } from 'obsidian';

export interface ObsidianContextSnapshotOptions {
	maxFileChars?: number;
	maxFolderFiles?: number;
	maxOutgoingLinks?: number;
	maxBacklinks?: number;
}

const DEFAULT_MAX_FILE_CHARS = 12000;
const DEFAULT_MAX_FOLDER_FILES = 40;
const DEFAULT_MAX_LINKS = 20;

type FileCacheLike = {
	frontmatter?: Record<string, unknown>;
	tags?: Array<{ tag?: string }>;
	links?: Array<{ link?: string }>;
};

type AppWithMetadata = App & {
	metadataCache: App['metadataCache'] & {
		resolvedLinks?: Record<string, Record<string, number>>;
	};
};

function unique(values: string[]): string[] {
	return Array.from(new Set(values.filter(value => value.trim().length > 0)));
}

function truncate(value: string, maxChars: number): string {
	if (value.length <= maxChars) return value;
	return `${value.slice(0, maxChars).trimEnd()}\n...[truncated]`;
}

function formatValue(value: unknown): string {
	if (Array.isArray(value)) {
		return value.join(', ');
	}
	if (value && typeof value === 'object') {
		return JSON.stringify(value);
	}
	return String(value);
}

function formatLinks(paths: string[]): string {
	return paths.map(path => `[[${path}]]`).join(', ');
}

function formatFrontmatter(frontmatter?: Record<string, unknown>): string[] {
	if (!frontmatter) return [];
	return Object.entries(frontmatter)
		.filter(([key, value]) => key !== 'position' && value !== undefined && value !== null)
		.map(([key, value]) => `- ${key}: ${formatValue(value)}`);
}

function extractTags(cache: FileCacheLike): string[] {
	const cacheTags = (cache.tags ?? [])
		.map(tag => tag.tag ?? '')
		.filter(Boolean);
	const frontmatterTags = cache.frontmatter?.tags;
	if (Array.isArray(frontmatterTags)) {
		cacheTags.push(...frontmatterTags.map(tag => String(tag)));
	} else if (typeof frontmatterTags === 'string') {
		cacheTags.push(frontmatterTags);
	}
	return unique(cacheTags);
}

function extractOutgoingLinks(cache: FileCacheLike, maxLinks: number): string[] {
	return unique((cache.links ?? [])
		.map(link => link.link ?? '')
		.filter(Boolean))
		.slice(0, maxLinks);
}

function extractBacklinks(app: AppWithMetadata, file: TFile, maxLinks: number): string[] {
	const resolvedLinks = app.metadataCache.resolvedLinks ?? {};
	const backlinks = Object.entries(resolvedLinks)
		.filter(([, targets]) => Boolean(targets[file.path]))
		.map(([sourcePath]) => sourcePath);
	return unique(backlinks).slice(0, maxLinks);
}

async function readFileContent(app: App, file: TFile): Promise<string> {
	try {
		if (typeof app.vault.cachedRead === 'function') {
			return await app.vault.cachedRead(file);
		}
		return await app.vault.read(file);
	} catch (error) {
		console.warn(`[ObsidianContext] Failed to read ${file.path}:`, error);
		return '';
	}
}

async function buildFileSnapshot(
	app: AppWithMetadata,
	file: TFile,
	options: Required<ObsidianContextSnapshotOptions>
): Promise<string> {
	const cache = (app.metadataCache.getFileCache(file) ?? {}) as FileCacheLike;
	const properties = formatFrontmatter(cache.frontmatter);
	const tags = extractTags(cache);
	const outgoingLinks = extractOutgoingLinks(cache, options.maxOutgoingLinks);
	const backlinks = extractBacklinks(app, file, options.maxBacklinks);
	const content = truncate((await readFileContent(app, file)).trim(), options.maxFileChars);

	const lines = [`### File: [[${file.path}]]`];
	if (properties.length > 0) {
		lines.push('Properties:', ...properties);
	}
	if (tags.length > 0) {
		lines.push(`Tags: ${tags.join(', ')}`);
	}
	if (outgoingLinks.length > 0) {
		lines.push(`Outgoing links: ${formatLinks(outgoingLinks)}`);
	}
	if (backlinks.length > 0) {
		lines.push(`Backlinks: ${formatLinks(backlinks)}`);
	}
	if (content.length > 0) {
		lines.push('Content excerpt:', content);
	}
	return lines.join('\n');
}

function isInFolder(file: TFile, folder: TFolder): boolean {
	const folderPath = folder.path.replace(/\/+$/, '');
	if (!folderPath) return true;
	return file.path === folderPath || file.path.startsWith(`${folderPath}/`);
}

function buildFolderSnapshot(app: App, folder: TFolder, maxFolderFiles: number): string {
	const files = app.vault.getMarkdownFiles()
		.filter(file => isInFolder(file, folder))
		.sort((a, b) => a.path.localeCompare(b.path));
	const visible = files.slice(0, maxFolderFiles);
	const lines = [
		`### Folder: ${folder.path || '/'}`,
		`Markdown notes: ${files.length}`,
		...visible.map(file => `- [[${file.path}]]`),
	];
	const hiddenCount = files.length - visible.length;
	if (hiddenCount > 0) {
		lines.push(`...and ${hiddenCount} more note(s).`);
	}
	return lines.join('\n');
}

export async function buildObsidianContextSnapshot(
	app: App,
	references: Array<TFile | TFolder>,
	options: ObsidianContextSnapshotOptions = {}
): Promise<string> {
	const normalizedOptions: Required<ObsidianContextSnapshotOptions> = {
		maxFileChars: options.maxFileChars ?? DEFAULT_MAX_FILE_CHARS,
		maxFolderFiles: options.maxFolderFiles ?? DEFAULT_MAX_FOLDER_FILES,
		maxOutgoingLinks: options.maxOutgoingLinks ?? DEFAULT_MAX_LINKS,
		maxBacklinks: options.maxBacklinks ?? DEFAULT_MAX_LINKS,
	};
	const uniqueReferences = Array.from(
		new Map(references.map(reference => [reference.path, reference])).values()
	);
	if (uniqueReferences.length === 0) {
		return '';
	}

	const appWithMetadata = app as AppWithMetadata;
	const sections: string[] = [];
	for (const reference of uniqueReferences) {
		if (reference instanceof TFile) {
			sections.push(await buildFileSnapshot(appWithMetadata, reference, normalizedOptions));
		} else if (reference instanceof TFolder) {
			sections.push(buildFolderSnapshot(app, reference, normalizedOptions.maxFolderFiles));
		}
	}

	if (sections.length === 0) {
		return '';
	}

	return [
		'## Obsidian context snapshot',
		'Generated from the current vault state. Use it as immediate context, and read referenced files when you need exact details.',
		'',
		...sections,
	].join('\n');
}

export function appendObsidianContextSnapshot(prompt: string, snapshot: string): string {
	const trimmedSnapshot = snapshot.trim();
	if (!trimmedSnapshot) {
		return prompt;
	}
	return [prompt.trim(), '---', trimmedSnapshot].join('\n\n');
}
