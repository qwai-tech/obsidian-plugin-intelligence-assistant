import { normalizePath } from 'obsidian';

export function vaultPath(raw: unknown): string {
	const trimmed = typeof raw === 'string' ? raw.trim().replace(/^(\.\/)+/, '') : '';
	return normalizePath(trimmed).replace(/^\/+|\/+$/g, '');
}
