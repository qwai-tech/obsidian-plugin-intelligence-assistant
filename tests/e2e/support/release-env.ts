import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ReleaseEnv {
	provider?: string;
	apiKey?: string;
	model?: string;
	baseUrl?: string;
	mcpName: string;
	mcpCommand?: string;
	mcpArgs?: string;
	mcpToolName?: string;
	mcpToolArgs: Record<string, unknown>;
	mcpExpectedText?: string;
}

const DOTENV_PATH = path.resolve('.env.test');

export function loadDotEnvTest(filePath = DOTENV_PATH): void {
	if (process.env.E2E_TEST_DISABLE_DOTENV === '1') {
		return;
	}
	if (!fs.existsSync(filePath)) {
		return;
	}

	const raw = fs.readFileSync(filePath, 'utf8');
	for (const line of raw.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) {
			continue;
		}

		const withoutExport = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
		const eqIndex = withoutExport.indexOf('=');
		if (eqIndex <= 0) {
			continue;
		}

		const key = withoutExport.slice(0, eqIndex).trim();
		let value = withoutExport.slice(eqIndex + 1).trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		if (process.env[key] === undefined || process.env[key] === '') {
			process.env[key] = value;
		}
	}
}

export function getReleaseEnv(): ReleaseEnv {
	loadDotEnvTest();
	return {
		provider: process.env.E2E_TEST_PROVIDER,
		apiKey: process.env.E2E_TEST_API_KEY,
		model: process.env.E2E_TEST_MODEL,
		baseUrl: process.env.E2E_TEST_BASE_URL,
		mcpName: process.env.E2E_TEST_MCP_NAME ?? 'release-mcp',
		mcpCommand: process.env.E2E_TEST_MCP_COMMAND,
		mcpArgs: process.env.E2E_TEST_MCP_ARGS,
		mcpToolName: process.env.E2E_TEST_MCP_TOOL_NAME,
		mcpToolArgs: parseJsonObject(process.env.E2E_TEST_MCP_TOOL_ARGS, { text: 'release' }),
		mcpExpectedText: process.env.E2E_TEST_MCP_EXPECTED_TEXT,
	};
}

export function missingReleaseLLMVars(env = getReleaseEnv()): string[] {
	const missing: string[] = [];
	if (!env.provider) missing.push('E2E_TEST_PROVIDER');
	if (!env.apiKey) missing.push('E2E_TEST_API_KEY');
	if (!env.model) missing.push('E2E_TEST_MODEL');
	return missing;
}

export function missingReleaseMcpVars(env = getReleaseEnv()): string[] {
	const missing = missingReleaseLLMVars(env);
	if (!env.mcpCommand) missing.push('E2E_TEST_MCP_COMMAND');
	if (!env.mcpToolName) missing.push('E2E_TEST_MCP_TOOL_NAME');
	return missing;
}

export function skipUnlessReleaseLLM(ctx: Mocha.Context): ReleaseEnv {
	const env = getReleaseEnv();
	const missing = missingReleaseLLMVars(env);
	if (missing.length > 0) {
		console.warn(`[release-e2e] Skipping real LLM spec; missing ${missing.join(', ')}`);
		ctx.skip();
	}
	return env;
}

export function skipUnlessReleaseMcp(ctx: Mocha.Context): ReleaseEnv {
	const env = getReleaseEnv();
	const missing = missingReleaseMcpVars(env);
	if (missing.length > 0) {
		console.warn(`[release-e2e] Skipping real MCP spec; missing ${missing.join(', ')}`);
		ctx.skip();
	}
	return env;
}

function parseJsonObject(value: string | undefined, fallback: Record<string, unknown>): Record<string, unknown> {
	if (!value) {
		return fallback;
	}
	try {
		const parsed = JSON.parse(value) as unknown;
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? parsed as Record<string, unknown>
			: fallback;
	} catch {
		return fallback;
	}
}
