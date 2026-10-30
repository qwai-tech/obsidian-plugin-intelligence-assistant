const { readdirSync, readFileSync } = require('fs');
const { join } = require('path');
const zlib = require('zlib');

function flattenKeys(tree, prefix = '') {
	return Object.entries(tree).flatMap(([key, value]) =>
		value !== null && typeof value === 'object' ? flattenKeys(value, `${prefix}${key}.`) : [`${prefix}${key}`]);
}

function valueAt(tree, key) {
	return key.split('.').reduce((node, part) => (node === undefined ? undefined : node[part]), tree);
}

function buildLocalePacks(localesDir) {
	const read = (file) => JSON.parse(readFileSync(join(localesDir, file), 'utf8'));
	const keys = flattenKeys(read('en.json'));
	const packs = {};
	for (const file of readdirSync(localesDir).filter((name) => name.endsWith('.json') && name !== 'en.json')) {
		const locale = read(file);
		const known = new Set(keys);
		const extras = Object.fromEntries(flattenKeys(locale).filter((key) => !known.has(key)).map((key) => [key, valueAt(locale, key)]));
		const values = JSON.stringify([keys.map((key) => valueAt(locale, key) ?? null), extras]);
		packs[file.slice(0, -'.json'.length)] = zlib
			.brotliCompressSync(Buffer.from(values), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } })
			.toString('base64');
	}
	return packs;
}

module.exports = { buildLocalePacks, flattenKeys };
