import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { Frameworks } from '@wdio/types';

export interface ReleaseProduct { path: string; content: string }
interface ReleaseManifest { runId: string; startedAt: number; gitCommit: string; version: string; artifacts: Record<string, string> }
export const RELEASE_CASES: Record<string, string> = {
	'Release real chat': 'real-chat',
	'Release real agent': 'real-agent',
	'Release large agentic task': 'large-task',
	'Release single long-running large task': 'long-task',
};
export function releaseEvidenceRoot(): string {
	const dir = process.env.IA_RELEASE_REPORT_ROOT;
	if (!dir) throw new Error('Run the real release runner to create fresh artifact-bound evidence');
	return path.resolve(dir);
}
export function wordCount(text: string): number {
	return (text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).length;
}
function sanitize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sanitize);
	if (!value || typeof value !== 'object') return value;
	return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, /^(?:apiKey|serviceKey|authorization|accessToken|refreshToken)$/i.test(key) ? '[REDACTED]' : sanitize(entry)]));
}
export async function captureReleaseProducts(id: string, products: ReleaseProduct[], metrics: Record<string, unknown> = {}): Promise<void> {
	if (process.env.IA_RELEASE_GATE !== '1') return;
	const dir = path.join(releaseEvidenceRoot(), 'cases', id);
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(path.join(dir, 'products.json'), JSON.stringify({ metrics, files: products.map(file => ({ ...file, words: wordCount(file.content), sha256: createHash('sha256').update(file.content).digest('hex') })) }, null, 2));
}
export async function installedReleaseArtifact(): Promise<{ vaultRoot: string; pluginDir: string; hashes: Record<string, string> }> {
	const location = await browser.execute(() => {
		const app = (window as unknown as { app: { vault: { adapter: { getBasePath(): string } }; plugins: { plugins: Record<string, { manifest: { dir: string } }> } } }).app;
		return { vaultRoot: app.vault.adapter.getBasePath(), pluginDir: app.plugins.plugins['intelligence-assistant'].manifest.dir };
	});
	const pluginDir = path.resolve(location.vaultRoot, location.pluginDir);
	const manifest = JSON.parse(await fs.readFile(path.join(releaseEvidenceRoot(), 'run.json'), 'utf8')) as ReleaseManifest;
	const hashes: Record<string, string> = {};
	for (const [name, expected] of Object.entries(manifest.artifacts)) {
		hashes[name] = createHash('sha256').update(await fs.readFile(path.join(pluginDir, name))).digest('hex');
		if (hashes[name] !== expected) throw new Error(`Installed release artifact differs: ${name}`);
	}
	await fs.appendFile(path.join(releaseEvidenceRoot(), 'installed-artifacts.jsonl'), JSON.stringify({ at: Date.now(), vaultRoot: location.vaultRoot, pluginDir, hashes }) + '\n');
	return { vaultRoot: location.vaultRoot, pluginDir, hashes };
}
export async function finishedReleaseRun(conversationId: string): Promise<{ id: string; durationMs: number; outcome: string; successfulCreates: number; successfulChecks: number }> {
	const installed = await installedReleaseArtifact();
	const folder = path.join(installed.pluginDir, 'data/conversations');
	let id: string | undefined;
	for (const name of await fs.readdir(folder)) {
		if (!name.endsWith('.json') || name === 'conversation-index.json') continue;
		const data = JSON.parse(await fs.readFile(path.join(folder, name), 'utf8')) as { id: string; messages: Array<{ role: string; agentTask?: { lastRun?: { id: string } } }> };
		if (data.id === conversationId) { const assistants = data.messages.filter(m => m.role === 'assistant'); id = assistants[assistants.length - 1]?.agentTask?.lastRun?.id; break; }
	}
	if (!id) throw new Error('No completed Agent run receipt');
	const entries = (await fs.readFile(path.join(installed.pluginDir, 'data/agent-runs', `${id}.jsonl`), 'utf8')).trim().split('\n').map(line => JSON.parse(line) as { at: number; event: { type: string; ok?: boolean; call?: { name: string }; reason?: { kind: string } } });
	const start = entries.find(e => e.event.type === 'run_started');
	const end = entries.find(e => e.event.type === 'run_finished');
	if (!start || !end) throw new Error('Agent journal lacks a real terminal boundary');
	return { id, durationMs: end.at - start.at, outcome: end.event.reason?.kind ?? 'unknown', successfulCreates: entries.filter(e => e.event.type === 'tool_finished' && e.event.ok && e.event.call?.name === 'create_note').length, successfulChecks: entries.filter(e => e.event.type === 'tool_finished' && e.event.ok && e.event.call?.name === 'check_note').length };
}
export async function captureReleaseCase(test: Frameworks.Test, result: Frameworks.TestResult): Promise<void> {
	const suite = Object.keys(RELEASE_CASES).find(name => `${test.parent ?? ''} ${test.fullTitle ?? ''}`.includes(name));
	if (!suite) throw new Error(`Unrecognized release suite: ${test.parent ?? test.title}`);
	const id = RELEASE_CASES[suite];
	const dir = path.join(releaseEvidenceRoot(), 'cases', id);
	await fs.mkdir(dir, { recursive: true });
	const installed = await installedReleaseArtifact();
	await browser.saveScreenshot(path.join(dir, 'screenshot.png'));
	const runtime = await browser.execute(() => {
		const app = (window as unknown as { app: { plugins: { plugins: Record<string, { settings: { activeConversationId?: string | null } }> } } }).app;
		return { conversationId: app.plugins.plugins['intelligence-assistant'].settings.activeConversationId };
	});
	const conversations = path.join(installed.pluginDir, 'data/conversations');
	let conversation: unknown;
	for (const name of await fs.readdir(conversations)) {
		if (!name.endsWith('.json') || name === 'conversation-index.json') continue;
		const data = JSON.parse(await fs.readFile(path.join(conversations, name), 'utf8')) as { id?: string };
		if (data.id === runtime.conversationId) { conversation = data; break; }
	}
	if (!conversation) throw new Error('No persisted real release conversation');
	await fs.writeFile(path.join(dir, 'conversation.json'), JSON.stringify(sanitize(conversation), null, 2));
	const journalDir = path.join(installed.pluginDir, 'data/agent-runs');
	try { for (const name of await fs.readdir(journalDir)) if (name.endsWith('.jsonl')) await fs.copyFile(path.join(journalDir, name), path.join(dir, name)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
	await fs.writeFile(path.join(dir, 'case.json'), JSON.stringify({ suite, id, passed: result.passed === true, capturedAt: Date.now(), installedHashes: installed.hashes, conversationId: runtime.conversationId }, null, 2));
}
