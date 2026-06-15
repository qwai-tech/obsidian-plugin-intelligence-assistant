#!/usr/bin/env node
/**
 * Obsidian API drift audit.
 *
 * Diffs the Obsidian public API (`obsidian.d.ts`) against (a) actual usage in
 * src/ and (b) the capability manifest, so adoption stays honest over time:
 *
 *   REGRESSION (exit 1): a manifest `used` capability is no longer referenced.
 *   STALE PLAN:          a `planned` capability is now referenced -> reclassify to `used`.
 *   UNCLASSIFIED:        an Obsidian export is used in src but not in the manifest.
 *   OPPORTUNITIES:       summary of `planned` capabilities still to build.
 *
 * Only REGRESSION fails the build; the rest are informational so new APIs and
 * newly-adopted ones surface without blocking.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DTS = path.join(ROOT, 'node_modules/obsidian/obsidian.d.ts');
const MANIFEST = path.join(ROOT, 'src/capabilities/capability-manifest.ts');

function readProductionSource() {
  const chunks = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === '__tests__' || e.name === 'vendor' || e.name === 'node_modules') continue;
        walk(full);
      } else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')
        && e.name !== 'capability-manifest.ts') {
        // Exclude the manifest itself — its probe strings would self-satisfy the audit.
        chunks.push(fs.readFileSync(full, 'utf8'));
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  chunks.push(fs.readFileSync(path.join(ROOT, 'main.ts'), 'utf8'));
  return chunks.join('\n');
}

function parseManifest() {
  const text = fs.readFileSync(MANIFEST, 'utf8');
  const entries = [];
  for (const line of text.split('\n')) {
    const probe = line.match(/probe:\s*["'`]([^"'`]*)["'`]/);
    const status = line.match(/status:\s*'(used|planned|na)'/);
    if (probe && status) entries.push({ probe: probe[1], status: status[1] });
  }
  return entries;
}

function exportedSymbols() {
  const text = fs.readFileSync(DTS, 'utf8');
  const names = new Set();
  const re = /export (?:abstract class|class|interface|function|const|declare function) ([A-Za-z0-9_]+)/g;
  let m;
  while ((m = re.exec(text))) names.add(m[1]);
  return [...names];
}

function main() {
  if (!fs.existsSync(DTS)) {
    console.error('obsidian.d.ts not found — is the obsidian dep installed?');
    process.exit(2);
  }
  const source = readProductionSource();
  const manifest = parseManifest();
  const symbols = exportedSymbols();
  const used = (probe) => source.includes(probe);
  const wordUsed = (name) => new RegExp(`\\b${name}\\b`).test(source);

  const regressions = manifest.filter((m) => m.status === 'used' && !used(m.probe));
  const stalePlans = manifest.filter((m) => m.status === 'planned' && used(m.probe));
  const manifestText = fs.readFileSync(MANIFEST, 'utf8');
  const unclassified = symbols.filter((s) => wordUsed(s) && !manifestText.includes(s));

  const counts = manifest.reduce((a, m) => ((a[m.status] = (a[m.status] || 0) + 1), a), {});
  console.log(`\nObsidian API audit — manifest: ${counts.used || 0} used, ${counts.planned || 0} planned, ${counts.na || 0} n/a | d.ts exports: ${symbols.length}`);

  if (stalePlans.length) {
    console.log('\nSTALE PLAN (now referenced — reclassify `planned` -> `used`):');
    stalePlans.forEach((m) => console.log(`  • ${m.probe}`));
  }
  if (unclassified.length) {
    console.log(`\nUNCLASSIFIED (Obsidian exports used in src but not in the manifest) — consider adding (${unclassified.length}):`);
    console.log('  ' + unclassified.sort().join(', '));
  }
  console.log('\nOPPORTUNITIES (planned, still to build):');
  manifest.filter((m) => m.status === 'planned').forEach((m) => console.log(`  • ${m.probe}`));

  if (regressions.length) {
    console.error('\nREGRESSION: manifest `used` capabilities no longer referenced in src:');
    regressions.forEach((m) => console.error(`  ✗ ${m.probe}`));
    console.error('\nFix the code or reclassify in the capability manifest. Audit FAILED.');
    process.exit(1);
  }
  console.log('\nAudit OK — no regressions.\n');
}

main();
