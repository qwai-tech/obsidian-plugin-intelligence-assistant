import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Frameworks } from '@wdio/types';
import { mockLLM } from './mock-llm';
import { getLivePluginDir } from './vault-fixture';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const DIAGNOSTICS_ROOT = path.join(REPO_ROOT, 'tests/e2e');
const MOCK_CALL_LIMIT = 20;

interface FailureDiagnostic {
	spec: string;
	test: string;
	duration: number;
	status: string;
	error?: {
		message?: string;
		stack?: string;
		name?: string;
	};
	artifacts: {
		screenshot?: string;
		pluginTree?: string;
		mockCalls?: string;
		failure?: string;
	};
}

function safeName(value: string): string {
	return value
		.replace(REPO_ROOT, '')
		.replace(/[^a-zA-Z0-9._-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 120) || 'unknown';
}

function toRepoRelative(filePath: string): string {
	return path.relative(REPO_ROOT, filePath).split(path.sep).join('/');
}

async function pathExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function listTree(root: string, current = root): Promise<string[]> {
	if (!(await pathExists(current))) {
		return [];
	}

	const entries = await fs.readdir(current, { withFileTypes: true });
	const lines: string[] = [];
	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		const absolutePath = path.join(current, entry.name);
		const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
		if (entry.isDirectory()) {
			lines.push(`${relativePath}/`);
			lines.push(...await listTree(root, absolutePath));
		} else {
			lines.push(relativePath);
		}
	}
	return lines;
}

function errorInfo(error: unknown): FailureDiagnostic['error'] {
	if (!error || typeof error !== 'object') {
		return error === undefined ? undefined : { message: formatUnknown(error) };
	}

	const maybeError = error as { message?: unknown; stack?: unknown; name?: unknown };
	return {
		message: typeof maybeError.message === 'string' ? maybeError.message : undefined,
		stack: typeof maybeError.stack === 'string' ? maybeError.stack : undefined,
		name: typeof maybeError.name === 'string' ? maybeError.name : undefined,
	};
}

function formatUnknown(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === 'string') {
		return error;
	}
	if (typeof error === 'number') {
		return error.toString();
	}
	if (typeof error === 'boolean') {
		return error ? 'true' : 'false';
	}
	if (error === null) {
		return 'null';
	}
	try {
		return JSON.stringify(error) ?? 'unknown error';
	} catch {
		return 'unknown error';
	}
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
	await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

export async function captureE2EDiagnostics(
	test: Frameworks.Test,
	result: Frameworks.TestResult
): Promise<void> {
	const specName = safeName(test.file ? toRepoRelative(test.file) : test.parent || 'unknown-spec');
	const testName = safeName(test.fullTitle || test.title || test.fullName || 'unknown-test');
	const screenshotDir = path.join(DIAGNOSTICS_ROOT, 'screenshots', specName);
	const stateDir = path.join(DIAGNOSTICS_ROOT, 'state-dumps', specName);
	const logDir = path.join(DIAGNOSTICS_ROOT, 'logs', specName);
	await Promise.all([
		fs.mkdir(screenshotDir, { recursive: true }),
		fs.mkdir(stateDir, { recursive: true }),
		fs.mkdir(logDir, { recursive: true }),
	]);

	const artifacts: FailureDiagnostic['artifacts'] = {};
	const screenshotPath = path.join(screenshotDir, `${testName}.png`);
	try {
		await browser.saveScreenshot(screenshotPath);
		artifacts.screenshot = toRepoRelative(screenshotPath);
	} catch (error) {
		artifacts.screenshot = `failed: ${formatUnknown(error)}`;
	}

	const pluginTreePath = path.join(stateDir, `${testName}.plugin-tree.txt`);
	const pluginTree = await listTree(getLivePluginDir());
	await fs.writeFile(pluginTreePath, `${pluginTree.join('\n')}\n`, 'utf-8');
	artifacts.pluginTree = toRepoRelative(pluginTreePath);

	const mockCallsPath = path.join(logDir, `${testName}.mock-calls.json`);
	try {
		const calls = await mockLLM.getCalls();
		await writeJson(mockCallsPath, calls.slice(-MOCK_CALL_LIMIT));
	} catch (error) {
		await writeJson(mockCallsPath, {
			unavailable: true,
			message: formatUnknown(error),
		});
	}
	artifacts.mockCalls = toRepoRelative(mockCallsPath);

	const failurePath = path.join(logDir, `${testName}.failure.json`);
	artifacts.failure = toRepoRelative(failurePath);
	await writeJson(failurePath, {
		spec: test.file ? toRepoRelative(test.file) : test.parent,
		test: test.fullTitle || test.title || test.fullName,
		duration: result.duration,
		status: result.status || 'failed',
		error: errorInfo(result.error),
		artifacts,
	} satisfies FailureDiagnostic);
}
