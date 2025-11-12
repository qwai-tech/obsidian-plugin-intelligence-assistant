import type { DataAdapter } from 'obsidian';

/**
 * Ensure that a folder (and its parents) exist inside the vault adapter.
 */
export async function ensureFolderExists(adapter: DataAdapter, folder: string): Promise<void> {
	if (!folder) {
		return;
	}

	if (await adapter.exists(folder)) {
		return;
	}

	const segments = folder.split('/').filter(Boolean);
	let current = '';
	for (const segment of segments) {
		current = current ? `${current}/${segment}` : segment;
		if (!(await adapter.exists(current))) {
			await adapter.mkdir(current);
		}
	}
}

/**
 * Sanitize a value for safe use in file or folder names.
 */
export function sanitizeIdentifier(value: string, fallback: string): string {
	const trimmed = (value ?? '').trim();
	if (!trimmed) {
		return fallback;
	}
	return trimmed.replace(/[^a-zA-Z0-9_-]/g, '-');
}

/**
 * Generate a stable, short hash for identifiers.
 */
export function stableHash(value: string): string {
	let hash = 0;
	for (let i = 0; i < value.length; i++) {
		hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
	}
	return hash.toString(36);
}

/**
 * Build a deterministic file or folder name using a sanitized portion
 * and a short hash suffix to avoid collisions.
 */
export function buildSafeName(value: string, fallback: string): string {
	const sanitized = sanitizeIdentifier(value, fallback);
	const hash = stableHash(value);
	return `${sanitized}-${hash}`;
}
