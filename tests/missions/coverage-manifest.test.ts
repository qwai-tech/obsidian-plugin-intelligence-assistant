import * as fs from 'node:fs';
import * as path from 'node:path';
import { COVERAGE_MANIFEST } from './coverage-manifest';

const REPO_ROOT = path.resolve(__dirname, '../..');

describe('mission coverage manifest', () => {
  it('every declared capability maps to an existing mission file', () => {
    const missing = Object.entries(COVERAGE_MANIFEST)
      .filter(([, file]) => !fs.existsSync(path.join(REPO_ROOT, file)))
      .map(([cap, file]) => `${cap} -> ${file}`);
    expect(missing).toEqual([]);
  });
  it('covers the core agent reliability capabilities', () => {
    const required = ['permission-isolation', 'max-steps-budget', 'tool-error-recovery', 'stop-abort', 'large-multi-step-task'];
    const covered = Object.keys(COVERAGE_MANIFEST);
    expect(required.every((c) => covered.includes(c))).toBe(true);
  });
});
