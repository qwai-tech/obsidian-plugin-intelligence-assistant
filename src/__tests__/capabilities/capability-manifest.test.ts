import * as fs from 'node:fs';
import * as path from 'node:path';
import { CAPABILITY_MANIFEST, type Capability } from '@/capabilities/capability-manifest';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const SRC_DIR = path.join(REPO_ROOT, 'src');

/** Concatenate all production `.ts` under src/ (excluding tests) into one haystack. */
function readProductionSource(): string {
	const out: string[] = [];
	const walk = (dir: string): void => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name === '__tests__' || entry.name === 'vendor') continue;
				walk(full);
			} else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')
				&& entry.name !== 'capability-manifest.ts') {
				// Exclude the manifest itself — its probe strings would self-satisfy the checks.
				out.push(fs.readFileSync(full, 'utf8'));
			}
		}
	};
	walk(SRC_DIR);
	// main.ts lives at repo root, not under src/.
	out.push(fs.readFileSync(path.join(REPO_ROOT, 'main.ts'), 'utf8'));
	return out.join('\n');
}

const SOURCE = readProductionSource();

describe('Obsidian capability manifest', () => {
	it('has no duplicate API entries and valid statuses', () => {
		const seen = new Set<string>();
		const dupes: string[] = [];
		for (const c of CAPABILITY_MANIFEST) {
			if (seen.has(c.api)) dupes.push(c.api);
			seen.add(c.api);
			expect(['used', 'planned', 'na']).toContain(c.status);
		}
		expect(dupes).toEqual([]);
	});

	it('every `used` capability is actually referenced in production source', () => {
		const missing = CAPABILITY_MANIFEST
			.filter((c) => c.status === 'used')
			.filter((c) => !SOURCE.includes(c.probe))
			.map((c) => `${c.api} (probe: "${c.probe}")`);
		expect(missing).toEqual([]);
	});

	it('every `used` capability with a linked test points to an existing file', () => {
		const broken = CAPABILITY_MANIFEST
			.filter((c): c is Capability & { test: string } => c.status === 'used' && Boolean(c.test))
			.filter((c) => !fs.existsSync(path.join(REPO_ROOT, c.test)))
			.map((c) => `${c.api} -> ${c.test}`);
		expect(broken).toEqual([]);
	});

	it('every `planned` capability has a tier (1-3) and a reason', () => {
		const bad = CAPABILITY_MANIFEST
			.filter((c) => c.status === 'planned')
			.filter((c) => !c.reason || ![1, 2, 3].includes(c.tier as number))
			.map((c) => c.api);
		expect(bad).toEqual([]);
	});

	it('every `na` capability has a reason', () => {
		const bad = CAPABILITY_MANIFEST
			.filter((c) => c.status === 'na')
			.filter((c) => !c.reason)
			.map((c) => c.api);
		expect(bad).toEqual([]);
	});

	// Full adoption reached: every Tier-1 opportunity has been implemented, so the
	// former "at least 3 Tier-1 planned" floor (an ambition guard) is now obsolete.
	// We keep the weaker invariant that any *remaining* planned entry is still
	// well-formed (valid tier 1-3 + non-empty reason).
	it('every remaining planned entry stays well-formed (valid tier + reason)', () => {
		const bad = CAPABILITY_MANIFEST
			.filter((c) => c.status === 'planned')
			.filter((c) => !c.reason || !c.reason.trim() || ![1, 2, 3].includes(c.tier as number))
			.map((c) => c.api);
		expect(bad).toEqual([]);
	});
});
