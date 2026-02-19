/**
 * SDK Bridge
 * Generates and manages a Node.js bridge script that loads ESM SDK packages.
 *
 * Electron's renderer process cannot:
 * - require() ES Modules (.mjs)
 * - import() with bare specifiers
 * - import() with file:// URLs (security restriction)
 *
 * The bridge runs in a plain Node.js child process where import() works normally.
 * It streams raw SDK events as JSON lines over stdout.
 */

import { existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

const BRIDGE_FILENAME = 'sdk-bridge.mjs';

/**
 * The bridge script content.
 * Runs in a standalone Node.js process, loads the requested SDK via import(),
 * reads JSON input from stdin, streams SDK events as JSON lines to stdout.
 */
const BRIDGE_SOURCE = `#!/usr/bin/env node
import { createInterface } from 'node:readline';

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + '\\n');
}

function readStdin() {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, terminal: false });
    const lines = [];
    rl.on('line', (line) => lines.push(line));
    rl.on('close', () => resolve(lines.join('\\n')));
  });
}

async function runClaude(input) {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  const ac = new AbortController();
  process.on('SIGTERM', () => ac.abort());

  const options = {
    ...input.options,
    abortController: ac,
    includePartialMessages: true
  };

  for await (const msg of query({ prompt: input.prompt, options })) {
    emit(msg);
  }
}

async function runCodex(input) {
  const { Codex } = await import('@openai/codex-sdk');
  const ac = new AbortController();
  process.on('SIGTERM', () => ac.abort());

  const codex = new Codex(input.codexOptions || {});
  const thread = codex.startThread(input.threadOptions || {});

  for await (const event of thread.runStreamed(input.prompt, { signal: ac.signal })) {
    emit(event);
  }
}

async function runQwen(input) {
  const { query } = await import('@qwen-code/sdk');
  const ac = new AbortController();
  process.on('SIGTERM', () => ac.abort());

  const options = {
    ...input.options,
    abortController: ac,
    includePartialMessages: true
  };

  for await (const msg of query({ prompt: input.prompt, options })) {
    emit(msg);
  }
}

async function main() {
  const provider = process.argv[2];
  const raw = await readStdin();
  const input = JSON.parse(raw);

  try {
    if (provider === 'claude-code') await runClaude(input);
    else if (provider === 'codex') await runCodex(input);
    else if (provider === 'qwen-code') await runQwen(input);
    else throw new Error('Unknown provider: ' + provider);
  } catch (err) {
    emit({ type: '__bridge_error__', message: err?.message || String(err) });
  }

  emit({ type: '__bridge_done__' });
}

main().catch((err) => {
  process.stderr.write(String(err?.message || err) + '\\n');
  process.exit(1);
});
`;

/** Ensure the bridge script exists in the plugin directory, updating if changed */
export function ensureBridgeScript(pluginDir: string): string {
	const bridgePath = join(pluginDir, BRIDGE_FILENAME);
	// Write or update if content differs
	if (existsSync(bridgePath)) {
		try {
			const existing = readFileSync(bridgePath, 'utf8');
			if (existing === BRIDGE_SOURCE) return bridgePath;
		} catch { /* rewrite on read error */ }
	}
	writeFileSync(bridgePath, BRIDGE_SOURCE, 'utf8');
	return bridgePath;
}
