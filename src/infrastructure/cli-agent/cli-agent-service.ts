/**
 * CLI Agent Service
 * Wraps Claude Agent SDK, Codex SDK, and Qwen Code SDK
 * to execute CLI agents with full agent capabilities.
 *
 * SDKs are ESM-only and Electron's renderer can't load them directly.
 * This service spawns a Node.js child process (sdk-bridge.mjs) that
 * imports the SDK and streams events back via JSON-line stdout.
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { existsSync } from 'fs';
import { join } from 'path';
import type { CLIAgentConfig, CLIAgentMessage, CLIAgentResult } from '@/types';
import { CLI_PROVIDER_LABELS } from '@/types/core/cli-agent';
import { isSdkInstalled, SDK_PACKAGES } from './sdk-installer';
import { getFullPath } from './shell-env';
import { ensureBridgeScript } from './sdk-bridge';

export class CLIAgentService {
	/**
	 * Execute a CLI agent with the given prompt.
	 * Streams normalized messages via onMessage callback.
	 * @param pluginDir — plugin installation directory for SDK resolution
	 */
	async execute(
		agentConfig: CLIAgentConfig,
		prompt: string,
		onMessage: (message: CLIAgentMessage) => void,
		abortController?: AbortController,
		defaultCwd?: string,
		pluginDir?: string
	): Promise<CLIAgentResult> {
		const provider = agentConfig.provider;

		// Pre-flight: ensure the SDK is installed
		if (pluginDir && !isSdkInstalled(pluginDir, provider)) {
			const label = CLI_PROVIDER_LABELS[provider];
			const pkg = SDK_PACKAGES[provider].packageName;
			throw new Error(
				`${label} SDK (${pkg}) is not installed. ` +
				'Please install it from Settings > CLI Agents.'
			);
		}

		if (!pluginDir) {
			throw new Error('Plugin directory is required for CLI agent execution.');
		}

		const cwd = agentConfig.cwd || defaultCwd || process.cwd();
		const bridgePath = ensureBridgeScript(pluginDir);
		const nodeBin = this.findNode();

		// Build env for the child process
		const processEnv: Record<string, string> = {};
		for (const [k, v] of Object.entries(process.env)) {
			if (v != null) processEnv[k] = v;
		}
		processEnv['PATH'] = getFullPath();

		// Add agent-level env vars
		if (agentConfig.env) {
			Object.assign(processEnv, agentConfig.env);
		}

		// Add API key to env
		if (agentConfig.apiKey) {
			if (provider === 'claude-code') processEnv['ANTHROPIC_API_KEY'] = agentConfig.apiKey;
			else if (provider === 'codex') processEnv['OPENAI_API_KEY'] = agentConfig.apiKey;
			else if (provider === 'qwen-code') processEnv['DASHSCOPE_API_KEY'] = agentConfig.apiKey;
		}

		// Build the JSON input for the bridge script
		const bridgeInput = this.buildBridgeInput(agentConfig, prompt, cwd);

		return this.runBridge(
			nodeBin, bridgePath, pluginDir,
			provider, bridgeInput,
			onMessage, abortController, processEnv
		);
	}

	/** Find the node binary in PATH */
	private findNode(): string {
		const fullPath = getFullPath();
		const dirs = fullPath.split(':');
		for (const dir of dirs) {
			const candidate = join(dir, 'node');
			if (existsSync(candidate)) return candidate;
		}
		return 'node';
	}

	/** Build the JSON input payload for the bridge script */
	private buildBridgeInput(
		agent: CLIAgentConfig,
		prompt: string,
		cwd: string
	): Record<string, unknown> {
		if (agent.provider === 'claude-code') {
			return this.buildClaudeInput(agent, prompt, cwd);
		} else if (agent.provider === 'codex') {
			return this.buildCodexInput(agent, prompt, cwd);
		} else {
			return this.buildQwenInput(agent, prompt, cwd);
		}
	}

	private buildClaudeInput(
		agent: CLIAgentConfig,
		prompt: string,
		cwd: string
	): Record<string, unknown> {
		const permissionModeMap: Record<string, string> = {
			'default': 'default',
			'plan': 'plan',
			'auto-edit': 'acceptEdits',
			'bypass': 'bypassPermissions'
		};

		const options: Record<string, unknown> = {
			permissionMode: permissionModeMap[agent.permissionMode] ?? 'default'
		};

		if (agent.model) options['model'] = agent.model;
		if (agent.maxTurns) options['maxTurns'] = agent.maxTurns;
		if (agent.systemPrompt) options['systemPrompt'] = agent.systemPrompt;
		if (cwd) options['cwd'] = cwd;
		if (agent.allowedTools) options['allowedTools'] = agent.allowedTools;
		if (agent.disallowedTools) options['disallowedTools'] = agent.disallowedTools;
		if (agent.maxBudgetUsd) options['maxBudgetUsd'] = agent.maxBudgetUsd;
		if (agent.fallbackModel) options['fallbackModel'] = agent.fallbackModel;
		if (agent.enableFileCheckpointing) options['enableFileCheckpointing'] = true;
		if (agent.mcpServers && Object.keys(agent.mcpServers).length > 0) options['mcpServers'] = agent.mcpServers;
		if (agent.maxThinkingTokens) options['maxThinkingTokens'] = agent.maxThinkingTokens;
		if (agent.additionalDirectories?.length) options['additionalDirectories'] = agent.additionalDirectories;
		if (agent.permissionMode === 'bypass') options['allowDangerouslySkipPermissions'] = true;

		return { prompt, options };
	}

	private buildCodexInput(
		agent: CLIAgentConfig,
		prompt: string,
		cwd: string
	): Record<string, unknown> {
		const approvalModeMap: Record<string, string> = {
			'default': 'on-request',
			'plan': 'never',
			'auto-edit': 'on-failure',
			'bypass': 'never'
		};

		const codexOptions: Record<string, unknown> = {};
		if (agent.apiKey) codexOptions['apiKey'] = agent.apiKey;
		if (agent.baseUrl) codexOptions['baseUrl'] = agent.baseUrl;

		const threadOptions: Record<string, unknown> = {};
		if (agent.model) threadOptions['model'] = agent.model;
		if (cwd) threadOptions['workingDirectory'] = cwd;
		if (agent.systemPrompt) threadOptions['instructions'] = agent.systemPrompt;
		if (agent.sandboxMode) threadOptions['sandboxMode'] = agent.sandboxMode;
		if (agent.networkAccessEnabled != null) threadOptions['networkAccessEnabled'] = agent.networkAccessEnabled;
		if (agent.webSearchMode) threadOptions['webSearchMode'] = agent.webSearchMode;
		if (agent.skipGitRepoCheck != null) threadOptions['skipGitRepoCheck'] = agent.skipGitRepoCheck;
		if (agent.modelReasoningEffort) threadOptions['modelReasoningEffort'] = agent.modelReasoningEffort;
		if (agent.additionalDirectories?.length) threadOptions['additionalDirectories'] = agent.additionalDirectories;
		threadOptions['approvalPolicy'] = approvalModeMap[agent.permissionMode] ?? 'on-request';

		return { prompt, codexOptions, threadOptions };
	}

	private buildQwenInput(
		agent: CLIAgentConfig,
		prompt: string,
		cwd: string
	): Record<string, unknown> {
		const options: Record<string, unknown> = {
			permissionMode: agent.permissionMode === 'bypass' ? 'yolo' : agent.permissionMode
		};

		if (agent.model) options['model'] = agent.model;
		if (agent.systemPrompt) options['systemPrompt'] = agent.systemPrompt;
		if (cwd) options['cwd'] = cwd;
		if (agent.allowedTools) options['coreTools'] = agent.allowedTools;
		if (agent.disallowedTools) options['excludeTools'] = agent.disallowedTools;
		if (agent.debug) options['debug'] = true;
		if (agent.authType) options['authType'] = agent.authType;
		if (agent.mcpServers && Object.keys(agent.mcpServers).length > 0) options['mcpServers'] = agent.mcpServers;
		if (agent.maxSessionTurns) options['maxSessionTurns'] = agent.maxSessionTurns;

		return { prompt, options };
	}

	/**
	 * Spawn the bridge script and process events from its stdout.
	 * The bridge runs the SDK in a plain Node.js process.
	 */
	private runBridge(
		nodeBin: string,
		bridgePath: string,
		pluginDir: string,
		provider: string,
		input: Record<string, unknown>,
		onMessage: (message: CLIAgentMessage) => void,
		abortController?: AbortController,
		env?: Record<string, string>
	): Promise<CLIAgentResult> {
		return new Promise((resolve, reject) => {
			const proc = spawn(nodeBin, [bridgePath, provider], {
				env: env as NodeJS.ProcessEnv,
				cwd: pluginDir,
				stdio: ['pipe', 'pipe', 'pipe']
			});

			// Send input via stdin
			proc.stdin.write(JSON.stringify(input));
			proc.stdin.end();

			// Abort → kill the child process
			const abortHandler = () => { proc.kill('SIGTERM'); };
			if (abortController) {
				abortController.signal.addEventListener('abort', abortHandler, { once: true });
			}

			let resultContent = '';
			let sessionId: string | undefined;
			let finalResult: CLIAgentResult | undefined;
			let stderrOutput = '';

			// Read stderr for error diagnostics
			proc.stderr?.on('data', (data: Buffer) => {
				stderrOutput += data.toString();
			});

			// Parse JSON lines from stdout
			const rl = createInterface({ input: proc.stdout, terminal: false });
			rl.on('line', (line: string) => {
				let msg: Record<string, unknown>;
				try {
					msg = JSON.parse(line) as Record<string, unknown>;
				} catch {
					return; // skip non-JSON lines
				}

				// Bridge control messages
				if (msg.type === '__bridge_done__') return;
				if (msg.type === '__bridge_error__') {
					const errMsg = typeof msg.message === 'string' ? msg.message : 'Bridge error';
					onMessage({ type: 'error', content: errMsg });
					return;
				}

				// Dispatch based on provider message format
				if (provider === 'claude-code' || provider === 'qwen-code') {
					this.handleClaudeQwenMessage(msg, onMessage,
						(id) => { sessionId = id; },
						(text) => { resultContent += text; },
						(r) => { finalResult = r; }
					);
				} else if (provider === 'codex') {
					this.handleCodexMessage(msg, onMessage, (text) => {
						resultContent += text;
					});
				}
			});

			proc.on('close', (code) => {
				if (abortController) {
					abortController.signal.removeEventListener('abort', abortHandler);
				}

				onMessage({ type: 'done', content: '' });

				if (finalResult) {
					// Merge accumulated text content and sessionId into the final result
					if (!finalResult.content && resultContent) finalResult.content = resultContent;
					if (!finalResult.sessionId && sessionId) finalResult.sessionId = sessionId;
					resolve(finalResult);
				} else if (code === 0 || abortController?.signal.aborted) {
					resolve({ success: true, content: resultContent, sessionId });
				} else {
					reject(new Error(
						`CLI agent bridge exited with code ${String(code)}` +
						(stderrOutput ? `:\n${stderrOutput.slice(0, 500)}` : '')
					));
				}
			});

			proc.on('error', (err) => {
				if (abortController) {
					abortController.signal.removeEventListener('abort', abortHandler);
				}
				const message = err.message.includes('ENOENT')
					? 'Node.js not found. Please install Node.js.'
					: err.message;
				reject(new Error(message));
			});
		});
	}

	/** Handle Claude SDK and Qwen SDK message format (they share the same structure) */
	private handleClaudeQwenMessage(
		msg: Record<string, unknown>,
		onMessage: (message: CLIAgentMessage) => void,
		onSessionId: (id: string) => void,
		onText: (text: string) => void,
		onResult: (result: CLIAgentResult) => void
	): void {
		if (msg.type === 'system' && msg.subtype === 'init') {
			onSessionId(msg.session_id as string);
		} else if (msg.type === 'assistant') {
			const apiMsg = msg.message as Record<string, unknown> | undefined;
			if (!apiMsg) return;
			const content = apiMsg.content;
			if (!Array.isArray(content)) return;

			for (const block of content) {
				const b = block as Record<string, unknown>;
				if (b.type === 'text' && typeof b.text === 'string') {
					onMessage({ type: 'text', content: b.text });
					onText(b.text);
				} else if (b.type === 'tool_use') {
					onMessage({
						type: 'tool-use',
						content: JSON.stringify(b.input),
						toolName: b.name as string,
						metadata: { id: b.id as string }
					});
				}
			}
		} else if (msg.type === 'result') {
			const result = msg.result as string | undefined;
			const usage = msg.usage as Record<string, number> | undefined;

			onResult({
				success: msg.subtype === 'success',
				content: result ?? '',
				usage: usage ? {
					inputTokens: usage.input_tokens ?? 0,
					outputTokens: usage.output_tokens ?? 0,
					totalCostUsd: msg.total_cost_usd as number | undefined
				} : undefined,
				durationMs: msg.duration_ms as number | undefined
			});
		}
	}

	/** Handle Codex SDK message format */
	private handleCodexMessage(
		evt: Record<string, unknown>,
		onMessage: (message: CLIAgentMessage) => void,
		onText: (text: string) => void
	): void {
		const evtType = evt.type as string;

		if (evtType === 'item_completed' || evtType === 'item_updated') {
			const item = evt.item as Record<string, unknown> | undefined;
			if (!item) return;
			const itemType = item.type as string;

			if (itemType === 'agent_message') {
				const text = item.text as string | undefined;
				if (text) {
					onMessage({ type: 'text', content: text });
					onText(text);
				}
			} else if (itemType === 'command_execution' || itemType === 'mcp_tool_call') {
				const toolName = (item.command as string) || (item.toolName as string) || 'tool';
				onMessage({
					type: 'tool-use',
					content: JSON.stringify(item.args ?? item.input ?? ''),
					toolName
				});
			} else if (itemType === 'file_change') {
				onMessage({
					type: 'tool-use',
					content: typeof item.filePath === 'string' ? item.filePath : '',
					toolName: 'file_change'
				});
			}
		} else if (evtType === 'turn_failed') {
			const error = evt.error as Record<string, unknown> | undefined;
			const errMsg = typeof error?.message === 'string' ? error.message : 'Turn failed';
			onMessage({ type: 'error', content: errMsg });
		}
	}
}
