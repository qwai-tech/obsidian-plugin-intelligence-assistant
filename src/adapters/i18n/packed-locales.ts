import { brotliDecompressSync } from 'zlib';
import { LOCALE_PACKS } from 'virtual:locale-pack';

export function unpackLocale(lang: string, keys: readonly string[]): Record<string, unknown> | undefined {
	const packed = LOCALE_PACKS[lang];
	if (!packed) {
		return undefined;
	}
	const values = JSON.parse(brotliDecompressSync(Buffer.from(packed, 'base64')).toString('utf8')) as Array<string | null>;
	const tree: Record<string, unknown> = {};
	keys.forEach((key, index) => {
		const value = values[index];
		if (value !== null && value !== undefined) {
			setPath(tree, key.split('.'), value);
		}
	});
	return tree;
}

function setPath(tree: Record<string, unknown>, path: string[], value: string): void {
	let node = tree;
	for (const part of path.slice(0, -1)) {
		node = (node[part] ??= {}) as Record<string, unknown>;
	}
	node[path[path.length - 1]] = value;
}
