// Real Node timers and child processes only; no service credentials or mocks.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const output = path.resolve(process.env.IA_SOURCE_REVIEW_RESULTS || 'test-results/obsidian-review-fix-2026-11-05');
await fs.mkdir(output, { recursive: true });
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'ia-source-review-'));
try {
  const bundle = path.join(scratch, 'runtime.mjs');
  await build({
    stdin: { contents: `export { runtimeClock } from './packages/obsidian-llm/src/runtime-clock'; export { runCommand } from './src/adapters/process/command-runner'; export { buildSubprocessEnv } from './src/features/tools/subprocess-env'; export { resolveCommand } from './src/adapters/process/resolve-command';`, resolveDir: process.cwd(), loader: 'ts' },
    alias: { '@qwai/obsidian-llm': path.resolve('packages/obsidian-llm/src/runtime-clock.ts') },
    bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'silent',
  });
  const { runtimeClock, runCommand, buildSubprocessEnv, resolveCommand } = await import(pathToFileURL(bundle));
  const checks = [];
  let fired = 0;
  await new Promise(resolve => runtimeClock.schedule(() => { fired++; resolve(); }, 10));
  assert.equal(fired, 1);
  checks.push('A real Node deadline fires exactly once without a DOM window');
  let cancelled = false;
  const timer = runtimeClock.schedule(() => { cancelled = true; }, 10);
  runtimeClock.cancel(timer);
  await new Promise(resolve => runtimeClock.schedule(resolve, 25));
  assert.equal(cancelled, false);
  checks.push('A cancelled deadline never fires');

  const command = async (source, options = {}) => runCommand({ command: process.execPath, args: ['-e', source], env: buildSubprocessEnv(), shell: false, timeoutMs: 5000, ...options });
  const completed = await command('process.stdout.write("REVIEW_PROCESS_OK")');
  assert.equal(completed.exitCode, 0);
  assert.equal(completed.stdout, 'REVIEW_PROCESS_OK');
  checks.push('A real configured child process returns its actual output');
  await assert.rejects(command('setInterval(() => {}, 1000)', { timeoutMs: 100 }), /Command timed out/);
  checks.push('The real timeout terminates a running child process');
  const stop = new AbortController();
  const running = command('setInterval(() => {}, 1000)', { signal: stop.signal });
  const abortTimer = runtimeClock.schedule(() => stop.abort(), 100);
  try { await assert.rejects(running, /Command aborted/); }
  finally { runtimeClock.cancel(abortTimer); }
  checks.push('An explicit cancellation terminates a running child process');

  const probe = 'IA_SOURCE_REVIEW_UNLISTED_PROBE';
  const previous = process.env[probe];
  try {
    process.env[probe] = 'should-not-be-inherited';
    const result = await command('process.stdout.write(JSON.stringify({unlisted:process.env.IA_SOURCE_REVIEW_UNLISTED_PROBE!==undefined,explicit:process.env.IA_SOURCE_REVIEW_EXPLICIT}))', { env: buildSubprocessEnv({ IA_SOURCE_REVIEW_EXPLICIT: 'allowed' }) });
    assert.deepEqual(JSON.parse(result.stdout), { unlisted: false, explicit: 'allowed' });
  } finally {
    if (previous === undefined) delete process.env[probe]; else process.env[probe] = previous;
  }
  checks.push('A real subprocess receives explicit variables and excludes an unlisted parent variable');
  const resolved = await resolveCommand('node');
  await fs.access(resolved);
  checks.push('Executable resolution locates the real Node executable');
  const result = { mocks: false, liveModelCalls: false, checks, passed: checks.length, node: process.version };
  await fs.writeFile(path.join(output, 'real-process-and-clock.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally { await fs.rm(scratch, { recursive: true, force: true }); }
