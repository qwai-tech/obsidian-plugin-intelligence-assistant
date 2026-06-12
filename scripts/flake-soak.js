#!/usr/bin/env node
/**
 * Flake-soak: run the deterministic harness+mission suite N times and require
 * IDENTICAL results every time. Any variation (a flake) or any failure exits 1.
 * Proves the gating layer is deterministic — the spec's "reliable" axiom.
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const RUNS = Number(process.env.FLAKE_SOAK_RUNS || 20);
const JEST = path.resolve(__dirname, '../node_modules/.bin/jest');
const ARGS = ['tests/harness', 'tests/missions', '--json', '--silent'];

function runOnce(i) {
  let raw;
  try {
    raw = execFileSync(JEST, ARGS, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    raw = err.stdout ? err.stdout.toString() : '';
  }
  const start = raw.indexOf('{');
  if (start < 0) throw new Error(`Run ${i}: no JSON output from jest`);
  const result = JSON.parse(raw.slice(start));
  return {
    success: result.success,
    numPassedTests: result.numPassedTests,
    numFailedTests: result.numFailedTests,
    numTotalTests: result.numTotalTests,
  };
}

function main() {
  console.log(`Flake-soak: ${RUNS} runs of the harness+mission suite...`);
  const baseline = runOnce(1);
  console.log(`Run 1: ${JSON.stringify(baseline)}`);
  if (!baseline.success) {
    console.error('FLAKE-SOAK FAILED: baseline run did not pass.');
    process.exit(1);
  }
  for (let i = 2; i <= RUNS; i++) {
    const r = runOnce(i);
    const same = r.success === baseline.success
      && r.numPassedTests === baseline.numPassedTests
      && r.numFailedTests === baseline.numFailedTests
      && r.numTotalTests === baseline.numTotalTests;
    if (!same) {
      console.error(`FLAKE DETECTED on run ${i}: ${JSON.stringify(r)} != baseline ${JSON.stringify(baseline)}`);
      process.exit(1);
    }
    if (i % 5 === 0) console.log(`Run ${i}: stable (${r.numPassedTests} passed)`);
  }
  console.log(`Flake-soak PASSED: ${RUNS}/${RUNS} runs identical (${baseline.numPassedTests} passed each).`);
}

main();
