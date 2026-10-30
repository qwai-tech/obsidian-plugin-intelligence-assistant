export interface IndexCandidate {
	path: string;
	extension: string;
	tags: readonly string[];
}

export interface IndexFilters {
	excludeFolders: readonly string[];
	includeFileTypes: readonly string[];
	excludeFileTypes: readonly string[];
	filterByTag: readonly string[];
	excludeByTag: readonly string[];
}

export function isIndexable(file: IndexCandidate, filters: IndexFilters): boolean {
	const extension = normalizeExtension(file.extension);
	const included = clean(filters.includeFileTypes, normalizeExtension);
	if (included.length > 0 && !included.includes(extension)) return false;

	const excludedFolders = [...filters.excludeFolders, ...filters.excludeFileTypes.filter(entry => entry.includes('/'))];
	if (clean(excludedFolders, normalizeFolder).some(folder => file.path.startsWith(`${folder}/`))) return false;
	const excludedTypes = clean(filters.excludeFileTypes.filter(entry => !entry.includes('/')), normalizeExtension);
	if (excludedTypes.includes(extension)) return false;

	const tags = file.tags.map(normalizeTag);
	const hasAny = (wanted: string[]) => wanted.some(tag => tags.some(own => own === tag || own.startsWith(`${tag}/`)));
	if (hasAny(clean(filters.excludeByTag, normalizeTag))) return false;
	const required = clean(filters.filterByTag, normalizeTag);
	return required.length === 0 || hasAny(required);
}

function clean(entries: readonly string[], normalize: (entry: string) => string): string[] {
	return entries.map(normalize).filter(entry => entry.length > 0);
}

function normalizeExtension(extension: string): string {
	return extension.trim().replace(/^\./, '').toLowerCase();
}

function normalizeFolder(folder: string): string {
	return folder.trim().replace(/^\.?\/+/, '').replace(/\/+$/, '');
}

function normalizeTag(tag: string): string {
	return tag.trim().replace(/^#/, '').toLowerCase();
}
