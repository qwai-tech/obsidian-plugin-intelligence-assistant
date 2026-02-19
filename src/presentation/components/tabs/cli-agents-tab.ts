/**
 * CLI Agents Settings Tab
 * Displays CLI provider and agent management with sub-tabs
 */

import { exec } from 'child_process';
import { join } from 'path';
import { promisify } from 'util';
import { App, FileSystemAdapter, Notice } from 'obsidian';
import { showConfirm } from '@/presentation/components/modals/confirm-modal';
import type IntelligenceAssistantPlugin from '@plugin';
import type { CLIProviderConfig, CLIAgentConfig } from '@/types';
import { CLI_PROVIDER_LABELS } from '@/types/core/cli-agent';
import { createTable } from '@/presentation/utils/ui-helpers';
import { getFullPath, getEnvWithFullPath } from '@/infrastructure/cli-agent/shell-env';
import { getSdkStatus, SDK_PACKAGES, type SDKInstallStatus } from '@/infrastructure/cli-agent/sdk-installer';
import { SDKInstallModal } from '../modals/sdk-install-modal';
import { CLIProviderEditModal } from '../modals/cli-provider-edit-modal';
import { CLIAgentEditModal } from '../modals/cli-agent-edit-modal';

type CLIAgentsSubTab = 'providers' | 'agents';

/** Get the plugin's installation directory inside the vault */
function getPluginDir(app: App, plugin: IntelligenceAssistantPlugin): string {
	const basePath = app.vault.adapter instanceof FileSystemAdapter
		? app.vault.adapter.getBasePath()
		: '';
	return join(basePath, app.vault.configDir, 'plugins', plugin.manifest.id);
}

export function displayCLIAgentsTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	app: App,
	refreshDisplay: () => void,
	subTab: CLIAgentsSubTab = 'providers',
	setSubTab?: (tab: CLIAgentsSubTab) => void
): void {
	containerEl.createEl('h3', { text: 'CLI Agent management' });

	const desc = containerEl.createEl('p', {
		text: 'Configure SDK-based CLI providers and agents (Claude Code, Codex, Qwen Code) with full agent capabilities.'
	});
	desc.addClass('ia-section-description');

	// Sub-tab navigation
	const tabBar = containerEl.createDiv('settings-tabs');
	const tabDefs: Array<{ slug: CLIAgentsSubTab; label: string }> = [
		{ slug: 'providers', label: 'Providers' },
		{ slug: 'agents', label: 'Agents' }
	];

	const content = containerEl.createDiv('settings-tab-content');

	const renderContent = (slug: CLIAgentsSubTab) => {
		content.empty();
		if (slug === 'providers') {
			renderProvidersTab(content, plugin, app, refreshDisplay);
		} else {
			renderAgentsTab(content, plugin, app, refreshDisplay);
		}
	};

	tabDefs.forEach(def => {
		const btn = tabBar.createEl('button', { text: def.label });
		btn.className = 'settings-tab';
		btn.dataset.slug = def.slug;
		if (def.slug === subTab) {
			btn.addClass('is-active');
		}
		btn.addEventListener('click', () => {
			if (setSubTab) setSubTab(def.slug);
			Array.from(tabBar.children).forEach(el => el.removeClass('is-active'));
			btn.addClass('is-active');
			renderContent(def.slug);
		});
	});

	renderContent(subTab);
}

// ─── Providers Sub-Tab ───────────────────────────────────────────────

function renderProvidersTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	app: App,
	refreshDisplay: () => void
): void {
	const actionsRow = containerEl.createDiv('ia-section-actions');
	const count = plugin.settings.cliProviders.length;
	const summary = actionsRow.createDiv('ia-section-summary');
	summary.createSpan({ text: `${count} provider${count === 1 ? '' : 's'} configured` });

	const addBtn = actionsRow.createEl('button', { text: '+ add CLI provider' });
	addBtn.addClass('ia-button');
	addBtn.addClass('ia-button--primary');
	addBtn.addEventListener('click', () => {
		const newProvider: CLIProviderConfig = {
			id: `cli-provider-${Date.now()}`,
			provider: 'claude-code',
			createdAt: Date.now(),
			updatedAt: Date.now()
		};
		new CLIProviderEditModal(app, plugin, newProvider, async (saved) => {
			plugin.settings.cliProviders.push(saved);
			await plugin.saveSettings();
			refreshDisplay();
		}).open();
	});

	if (count === 0) {
		const emptyDiv = containerEl.createDiv('ia-empty-state');
		emptyDiv.setText('No CLI providers configured. Add one to get started.');
		return;
	}

	const pluginDir = getPluginDir(app, plugin);
	const table = createTable(containerEl, ['Provider', 'SDK', 'Auth', 'Status', 'Actions']);
	const tbody = table.tBodies[0];

	plugin.settings.cliProviders.forEach(provider => {
		const row = tbody.insertRow();
		row.addClass('ia-table-row');

		// Provider column
		const providerCell = row.insertCell();
		providerCell.addClass('ia-table-cell');
		const providerStack = providerCell.createDiv('ia-table-stack');
		providerStack.createDiv('ia-table-title').setText(CLI_PROVIDER_LABELS[provider.provider] || provider.provider);
		providerStack.createDiv('ia-table-subtext').setText(provider.id);

		// SDK column — install status
		const sdkCell = row.insertCell();
		sdkCell.addClass('ia-table-cell');
		const sdkStatus = getSdkStatus(pluginDir, provider.provider);
		const sdkBadge = sdkCell.createEl('span', { text: sdkStatusLabel(sdkStatus) });
		sdkBadge.addClass('ia-tag');
		if (sdkStatus === 'installed') sdkBadge.addClass('ia-tag--success');
		else if (sdkStatus === 'outdated') sdkBadge.addClass('ia-tag--warning');
		else sdkBadge.addClass('ia-tag--error');

		if (sdkStatus !== 'installed') {
			const installBtn = sdkCell.createEl('button', {
				text: sdkStatus === 'outdated' ? 'Update' : 'Install'
			});
			installBtn.addClass('ia-button', 'ia-button--ghost');
			installBtn.setCssProps({ 'margin-left': '6px', 'font-size': 'var(--font-ui-smaller)' });
			installBtn.addEventListener('click', () => {
				void new SDKInstallModal(app, provider.provider, pluginDir)
					.waitForResult()
					.then((installed: boolean) => { if (installed) refreshDisplay(); });
			});
		}

		// Auth column
		const authCell = row.insertCell();
		authCell.addClass('ia-table-cell');
		const authBadges = authCell.createDiv('ia-table-badges');
		const authStatus = getAuthStatusLabel(provider);
		const authBadge = authBadges.createEl('span', { text: authStatus.label });
		authBadge.addClass('ia-tag');
		if (authStatus.level === 'success') {
			authBadge.addClass('ia-tag--success');
		} else if (authStatus.level === 'warning') {
			authBadge.addClass('ia-tag--warning');
		}

		// Status column — updated by test
		const statusCell = row.insertCell();
		statusCell.addClass('ia-table-cell');
		const statusBadges = statusCell.createDiv('ia-table-badges');
		const statusBadge = statusBadges.createEl('span', { text: 'Not tested' });
		statusBadge.addClass('ia-tag');

		// Actions column
		const actionsCell = row.insertCell();
		actionsCell.addClass('ia-table-cell');
		actionsCell.addClass('ia-table-actions');

		const editBtn = actionsCell.createEl('button', { text: 'Edit' });
		editBtn.addClass('ia-button');
		editBtn.addClass('ia-button--ghost');
		editBtn.addEventListener('click', () => {
			new CLIProviderEditModal(app, plugin, provider, async (updated) => {
				const idx = plugin.settings.cliProviders.findIndex(p => p.id === updated.id);
				if (idx !== -1) {
					plugin.settings.cliProviders[idx] = updated;
					await plugin.saveSettings();
					refreshDisplay();
				}
			}).open();
		});

		const testBtn = actionsCell.createEl('button', { text: 'Test' });
		testBtn.addClass('ia-button');
		testBtn.addClass('ia-button--ghost');
		testBtn.addEventListener('click', () => {
			void testProviderConnection(provider, statusBadge);
		});

		const deleteBtn = actionsCell.createEl('button', { text: 'Delete' });
		deleteBtn.addClass('ia-button');
		deleteBtn.addClass('ia-button--danger');
		deleteBtn.addEventListener('click', () => {
			void (async () => {
				// Check if any agents reference this provider
				const referencingAgents = plugin.settings.cliAgents.filter(a => a.providerId === provider.id);
				const confirmMsg = referencingAgents.length > 0
					? `Delete CLI provider "${CLI_PROVIDER_LABELS[provider.provider]}"? ${String(referencingAgents.length)} agent(s) reference this provider and will need to be reassigned.`
					: `Delete CLI provider "${CLI_PROVIDER_LABELS[provider.provider]}"?`;

				if (await showConfirm(app, confirmMsg)) {
					const idx = plugin.settings.cliProviders.findIndex(p => p.id === provider.id);
					if (idx !== -1) {
						plugin.settings.cliProviders.splice(idx, 1);
						await plugin.saveSettings();
						refreshDisplay();
					}
				}
			})();
		});
	});
}

// ─── Agents Sub-Tab ──────────────────────────────────────────────────

function renderAgentsTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	app: App,
	refreshDisplay: () => void
): void {
	const actionsRow = containerEl.createDiv('ia-section-actions');
	const count = plugin.settings.cliAgents.length;
	const summary = actionsRow.createDiv('ia-section-summary');
	summary.createSpan({ text: `${count} CLI agent${count === 1 ? '' : 's'} configured` });

	const addBtn = actionsRow.createEl('button', { text: '+ add CLI agent' });
	addBtn.addClass('ia-button');
	addBtn.addClass('ia-button--primary');

	if (plugin.settings.cliProviders.length === 0) {
		addBtn.setAttr('disabled', 'true');
		addBtn.setAttr('title', 'Add a CLI provider first');
	}

	addBtn.addEventListener('click', () => {
		if (plugin.settings.cliProviders.length === 0) {
			new Notice('Please add a CLI provider first.');
			return;
		}
		const newAgent: CLIAgentConfig = {
			id: `cli-agent-${Date.now()}`,
			name: 'New CLI Agent',
			description: '',
			icon: 'terminal',
			providerId: plugin.settings.cliProviders[0].id,
			permissionMode: 'default',
			createdAt: Date.now(),
			updatedAt: Date.now()
		};
		new CLIAgentEditModal(app, newAgent, plugin.settings.cliProviders, async (saved) => {
			plugin.settings.cliAgents.push(saved);
			await plugin.saveSettings();
			refreshDisplay();
		}).open();
	});

	if (count === 0) {
		const emptyDiv = containerEl.createDiv('ia-empty-state');
		emptyDiv.setText('No CLI agents configured. Add one to get started.');
		return;
	}

	// Build provider lookup
	const providerMap = new Map(plugin.settings.cliProviders.map(p => [p.id, p]));

	const table = createTable(containerEl, ['Agent', 'Provider', 'Model', 'Permission', 'Actions']);
	const tbody = table.tBodies[0];

	plugin.settings.cliAgents.forEach(agent => {
		const row = tbody.insertRow();
		row.addClass('ia-table-row');

		// Agent column
		const agentCell = row.insertCell();
		agentCell.addClass('ia-table-cell');
		const agentStack = agentCell.createDiv('ia-table-stack');
		agentStack.createDiv('ia-table-title').setText(agent.name);
		if (agent.description) {
			agentStack.createDiv('ia-table-subtext').setText(agent.description);
		}

		// Provider column
		const providerCell = row.insertCell();
		providerCell.addClass('ia-table-cell');
		const provider = providerMap.get(agent.providerId);
		const providerBadges = providerCell.createDiv('ia-table-badges');
		const providerLabel = provider
			? CLI_PROVIDER_LABELS[provider.provider] || provider.provider
			: 'Unknown';
		const pBadge = providerBadges.createEl('span', { text: providerLabel });
		pBadge.addClass('ia-tag');
		if (!provider) {
			pBadge.setCssProps({ 'opacity': '0.5' });
		}

		// Model column
		const modelCell = row.insertCell();
		modelCell.addClass('ia-table-cell');
		modelCell.createDiv('ia-table-title').setText(agent.model || 'Default');

		// Permission column
		const permCell = row.insertCell();
		permCell.addClass('ia-table-cell');
		const permBadges = permCell.createDiv('ia-table-badges');
		const permBadge = permBadges.createEl('span', { text: agent.permissionMode });
		permBadge.addClass('ia-tag');

		// Actions column
		const actionsCell = row.insertCell();
		actionsCell.addClass('ia-table-cell');
		actionsCell.addClass('ia-table-actions');

		const editBtn = actionsCell.createEl('button', { text: 'Edit' });
		editBtn.addClass('ia-button');
		editBtn.addClass('ia-button--ghost');
		editBtn.addEventListener('click', () => {
			new CLIAgentEditModal(app, agent, plugin.settings.cliProviders, async (updated) => {
				const idx = plugin.settings.cliAgents.findIndex(a => a.id === updated.id);
				if (idx !== -1) {
					plugin.settings.cliAgents[idx] = updated;
					await plugin.saveSettings();
					refreshDisplay();
				}
			}).open();
		});

		const deleteBtn = actionsCell.createEl('button', { text: 'Delete' });
		deleteBtn.addClass('ia-button');
		deleteBtn.addClass('ia-button--danger');
		deleteBtn.addEventListener('click', () => {
			void (async () => {
				if (await showConfirm(app, `Delete CLI agent "${agent.name}"?`)) {
					const idx = plugin.settings.cliAgents.findIndex(a => a.id === agent.id);
					if (idx !== -1) {
						plugin.settings.cliAgents.splice(idx, 1);
						await plugin.saveSettings();
						refreshDisplay();
					}
				}
			})();
		});
	});
}

// ─── Connection Test ─────────────────────────────────────────────────

/** CLI binary names and SDK/env info per provider */
const PROVIDER_CLI_INFO: Record<string, { commands: string[]; sdkPackage: string; envVar: string }> = {
	'claude-code': {
		commands: ['claude'],
		sdkPackage: '@anthropic-ai/claude-agent-sdk',
		envVar: 'ANTHROPIC_API_KEY'
	},
	'codex': {
		commands: ['codex'],
		sdkPackage: '@openai/codex-sdk',
		envVar: 'OPENAI_API_KEY'
	},
	'qwen-code': {
		commands: ['qwen-code', 'qwen'],
		sdkPackage: '@qwen-code/sdk',
		envVar: 'DASHSCOPE_API_KEY'
	}
};

/** Check if a CLI binary is available using `which` (unix) or `where` (windows) */
async function detectCliBinary(commands: string[]): Promise<{ found: boolean; command?: string; path?: string }> {
	const execAsync = promisify(exec);

	const isWin = process.platform === 'win32';
	const whichCmd = isWin ? 'where' : 'which';
	const envWithPath = getEnvWithFullPath();

	for (const cmd of commands) {
		try {
			const { stdout } = await execAsync(`${whichCmd} ${cmd}`, { timeout: 5000, env: envWithPath });
			const foundPath = stdout.trim().split('\n')[0];
			if (foundPath) {
				return { found: true, command: cmd, path: foundPath };
			}
		} catch {
			// Command not found, try next
		}
	}
	return { found: false };
}

/** Get CLI version if binary is available */
async function getCliVersion(command: string): Promise<string | null> {
	const execAsync = promisify(exec);
	try {
		const { stdout } = await execAsync(`${command} --version`, { timeout: 5000, env: getEnvWithFullPath() });
		return stdout.trim().split('\n')[0];
	} catch {
		return null;
	}
}

/** Check if an environment variable is set */
function checkEnvVar(envVar: string): boolean {
	return Boolean(process.env[envVar]);
}

/** Try to dynamically import the SDK package */
async function checkSdkImport(provider: string): Promise<{ available: boolean; error?: string }> {
	try {
		switch (provider) {
			case 'claude-code': {
				const mod = await import('@anthropic-ai/claude-agent-sdk');
				return { available: typeof mod.query === 'function' };
			}
			case 'codex': {
				const mod = await import('@openai/codex-sdk');
				return { available: typeof mod.Codex === 'function' };
			}
			case 'qwen-code': {
				const mod = await import('@qwen-code/sdk');
				return { available: typeof mod.query === 'function' };
			}
			default:
				return { available: false, error: 'Unknown provider' };
		}
	} catch (err) {
		return { available: false, error: err instanceof Error ? err.message : 'Import failed' };
	}
}

interface TestResult {
	cli: { found: boolean; command?: string; path?: string; version?: string };
	sdk: { available: boolean; error?: string };
	auth: { hasApiKey: boolean; hasEnvVar: boolean; envVarName: string };
}

async function testProviderConnection(provider: CLIProviderConfig, statusBadge?: HTMLElement): Promise<void> {
	const info = PROVIDER_CLI_INFO[provider.provider];
	if (!info) {
		new Notice(`Unknown provider: ${String(provider.provider)}`);
		return;
	}

	const label = CLI_PROVIDER_LABELS[provider.provider];
	new Notice(`Testing ${label}...`);

	if (statusBadge) {
		statusBadge.setText('Testing...');
		statusBadge.removeClass('ia-tag--success', 'ia-tag--warning', 'ia-tag--error');
	}

	try {
		// Run all checks in parallel
		const [cliResult, sdkResult] = await Promise.all([
			detectCliBinary(info.commands),
			checkSdkImport(provider.provider)
		]);

		const result: TestResult = {
			cli: cliResult,
			sdk: sdkResult,
			auth: {
				hasApiKey: Boolean(provider.apiKey),
				hasEnvVar: checkEnvVar(info.envVar),
				envVarName: info.envVar
			}
		};

		// Get version if CLI found
		if (result.cli.found && result.cli.command) {
			result.cli.version = (await getCliVersion(result.cli.command)) ?? undefined;
		}

		// Build result message
		const lines: string[] = [`${label} test results:`];

		// CLI check — show path and version when found
		if (result.cli.found) {
			const versionStr = result.cli.version ? ` v${result.cli.version}` : '';
			const pathStr = result.cli.path ? ` [${result.cli.path}]` : '';
			lines.push(`  CLI: ${result.cli.command ?? ''}${versionStr}${pathStr}`);
		} else {
			lines.push(`  CLI: Not found (${info.commands.join(', ')})`);
		}

		// SDK check
		if (result.sdk.available) {
			lines.push(`  SDK: ${info.sdkPackage} available`);
		} else {
			lines.push(`  SDK: ${info.sdkPackage} not available`);
		}

		// Auth check
		// All three SDKs support CLI-based login (OAuth/session) — API key is optional
		// when the CLI is installed and the user has logged in via the CLI.
		const cliCanAuth = result.cli.found;
		if (result.auth.hasApiKey) {
			lines.push('  Auth: API key configured in settings');
		} else if (result.auth.hasEnvVar) {
			lines.push(`  Auth: Using ${info.envVar} from environment`);
		} else if (cliCanAuth) {
			lines.push(`  Auth: Using ${label} CLI login (no API key needed)`);
		} else {
			lines.push(`  Auth: No API key set. Configure in settings or set ${info.envVar}`);
		}

		// Determine overall status
		const hasAuth = result.auth.hasApiKey || result.auth.hasEnvVar || cliCanAuth;
		const hasRuntime = result.cli.found || result.sdk.available;

		if (hasRuntime && hasAuth) {
			if (statusBadge) {
				statusBadge.setText('Ready');
				statusBadge.addClass('ia-tag--success');
			}
		} else if (hasRuntime && !hasAuth) {
			if (statusBadge) {
				statusBadge.setText('No auth');
				statusBadge.addClass('ia-tag--warning');
			}
		} else {
			if (statusBadge) {
				statusBadge.setText('Not available');
				statusBadge.addClass('ia-tag--error');
			}
		}

		// Show as a long-lived notice (10s) to give user time to read
		new Notice(lines.join('\n'), 10000);

	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		new Notice(`Connection test failed: ${msg}`);
		if (statusBadge) {
			statusBadge.setText('Error');
			statusBadge.addClass('ia-tag--error');
		}
	}
}

/** Get a quick auth status label for the provider table */
function getAuthStatusLabel(provider: CLIProviderConfig): { label: string; level: 'success' | 'warning' | 'none' } {
	const info = PROVIDER_CLI_INFO[provider.provider];
	if (provider.apiKey) {
		return { label: 'Key configured', level: 'success' };
	}
	if (info && checkEnvVar(info.envVar)) {
		return { label: `Env: ${info.envVar}`, level: 'success' };
	}
	// All providers support CLI login — show as usable (not warning)
	return { label: 'CLI login', level: 'none' };
}

function sdkStatusLabel(status: SDKInstallStatus): string {
	switch (status) {
		case 'installed': return 'Installed';
		case 'outdated': return 'Outdated';
		case 'not-installed': return 'Not installed';
	}
}
