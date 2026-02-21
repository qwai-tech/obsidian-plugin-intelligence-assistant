/**
 * CLI Agents Settings Tab
 * Single-tier agent management with auto-detection of installed CLI tools
 */

import { exec } from 'child_process';
import { join } from 'path';
import { promisify } from 'util';
import { App, FileSystemAdapter } from 'obsidian';
import { showConfirm } from '@/presentation/components/modals/confirm-modal';
import type IntelligenceAssistantPlugin from '@plugin';
import type { CLIAgentConfig, CLIAgentProvider } from '@/types';
import { CLI_PROVIDER_LABELS } from '@/types/core/cli-agent';
import { createTable } from '@/presentation/utils/ui-helpers';
import { getEnvWithFullPath } from '@/infrastructure/cli-agent/shell-env';
import { getSdkStatus, type SDKInstallStatus } from '@/infrastructure/cli-agent/sdk-installer';
import { SDKInstallModal } from '../modals/sdk-install-modal';
import { CLIAgentEditModal } from '../modals/cli-agent-edit-modal';

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
	refreshDisplay: () => void
): void {
	containerEl.createEl('h3', { text: 'CLI Agent management' });

	const desc = containerEl.createEl('p', {
		text: 'Configure SDK-based CLI agents (Claude Code, Codex, Qwen Code) with full agent capabilities.'
	});
	desc.addClass('ia-section-description');

	const pluginDir = getPluginDir(app, plugin);

	// --- Auto-detection panel ---
	renderDetectionPanel(containerEl, pluginDir, app);

	// --- Agents list ---
	renderAgentsSection(containerEl, plugin, app, pluginDir, refreshDisplay);
}

// ─── Auto-Detection Panel ────────────────────────────────────────────

/** CLI binary names and env info per provider */
const PROVIDER_CLI_INFO: Record<CLIAgentProvider, { commands: string[]; envVar: string }> = {
	'claude-code': { commands: ['claude'], envVar: 'ANTHROPIC_API_KEY' },
	'codex': { commands: ['codex'], envVar: 'OPENAI_API_KEY' },
	'qwen-code': { commands: ['qwen-code', 'qwen'], envVar: 'DASHSCOPE_API_KEY' }
};

function renderDetectionPanel(containerEl: HTMLElement, pluginDir: string, app: App): void {
	const panel = containerEl.createDiv('ia-detection-panel');
	panel.createEl('h4', { text: 'Installed CLI tools' });

	const grid = panel.createDiv('ia-detection-grid');

	const providers: CLIAgentProvider[] = ['claude-code', 'codex', 'qwen-code'];

	for (const provider of providers) {
		const card = grid.createDiv('ia-detection-card');
		const label = CLI_PROVIDER_LABELS[provider];

		// Header row: name + SDK status badge
		const header = card.createDiv('ia-detection-card__header');
		header.createSpan({ text: label, cls: 'ia-detection-card__name' });

		const sdkStatus = getSdkStatus(pluginDir, provider);
		const sdkBadge = header.createEl('span', { text: sdkStatusLabel(sdkStatus), cls: 'ia-tag' });
		if (sdkStatus === 'installed') sdkBadge.addClass('ia-tag--success');
		else if (sdkStatus === 'outdated') sdkBadge.addClass('ia-tag--warning');
		else sdkBadge.addClass('ia-tag--error');

		// CLI detection (async — fill in after render)
		const cliRow = card.createDiv('ia-detection-card__row');
		cliRow.createSpan({ text: 'CLI: ', cls: 'ia-detection-card__label' });
		const cliValue = cliRow.createSpan({ text: 'Checking...', cls: 'ia-detection-card__value' });

		// Auth status
		const authRow = card.createDiv('ia-detection-card__row');
		authRow.createSpan({ text: 'Auth: ', cls: 'ia-detection-card__label' });
		const info = PROVIDER_CLI_INFO[provider];
		const hasEnv = checkEnvVar(info.envVar);
		const authText = hasEnv ? `${info.envVar} set` : 'CLI login / not set';
		const authValue = authRow.createSpan({ text: authText, cls: 'ia-detection-card__value' });
		if (hasEnv) authValue.addClass('ia-detection-card__value--ok');

		// SDK install button if needed
		if (sdkStatus !== 'installed') {
			const installBtn = card.createEl('button', {
				text: sdkStatus === 'outdated' ? 'Update SDK' : 'Install SDK',
				cls: 'ia-button ia-button--ghost'
			});
			installBtn.setCssProps({ 'margin-top': '4px', 'font-size': 'var(--font-ui-smaller)' });
			installBtn.addEventListener('click', () => {
				new SDKInstallModal(app, provider, pluginDir).open();
			});
		}

		// Async CLI detection
		void detectCliBinary(info.commands).then(async (result) => {
			if (result.found && result.command) {
				const version = await getCliVersion(result.command);
				const versionStr = version ? ` v${version}` : '';
				cliValue.setText(`${result.command}${versionStr}`);
				cliValue.addClass('ia-detection-card__value--ok');
			} else {
				cliValue.setText('Not found');
				cliValue.addClass('ia-detection-card__value--missing');
			}
		});
	}
}

// ─── Agents Section ──────────────────────────────────────────────────

function renderAgentsSection(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	app: App,
	pluginDir: string,
	refreshDisplay: () => void
): void {
	const actionsRow = containerEl.createDiv('ia-section-actions');
	const count = (plugin.settings.cliAgents ?? []).length;
	const summary = actionsRow.createDiv('ia-section-summary');
	summary.createSpan({ text: `${count} CLI agent${count === 1 ? '' : 's'} configured` });

	const addBtn = actionsRow.createEl('button', { text: '+ add CLI agent' });
	addBtn.addClass('ia-button', 'ia-button--primary');
	addBtn.addEventListener('click', () => {
		const newAgent: CLIAgentConfig = {
			id: `cli-agent-${Date.now()}`,
			name: 'New CLI Agent',
			description: '',
			icon: 'terminal',
			provider: 'claude-code',
			permissionMode: 'default',
			createdAt: Date.now(),
			updatedAt: Date.now()
		};
		new CLIAgentEditModal(app, newAgent, pluginDir, async (saved) => {
			if (!plugin.settings.cliAgents) plugin.settings.cliAgents = [];
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

	const table = createTable(containerEl, ['Agent', 'Provider', 'Model', 'Permission', 'SDK', 'Actions']);
	const tbody = table.tBodies[0];

	const agents = plugin.settings.cliAgents ?? [];
	for (const agent of agents) {
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
		const providerBadges = providerCell.createDiv('ia-table-badges');
		const providerLabel = CLI_PROVIDER_LABELS[agent.provider] || agent.provider;
		providerBadges.createEl('span', { text: providerLabel, cls: 'ia-tag' });

		// Model column
		const modelCell = row.insertCell();
		modelCell.addClass('ia-table-cell');
		modelCell.createDiv('ia-table-title').setText(agent.model || 'Default');

		// Permission column
		const permCell = row.insertCell();
		permCell.addClass('ia-table-cell');
		const permBadges = permCell.createDiv('ia-table-badges');
		permBadges.createEl('span', { text: agent.permissionMode, cls: 'ia-tag' });

		// SDK Status column
		const sdkCell = row.insertCell();
		sdkCell.addClass('ia-table-cell');
		const sdkStatus = getSdkStatus(pluginDir, agent.provider);
		const sdkBadge = sdkCell.createEl('span', { text: sdkStatusLabel(sdkStatus), cls: 'ia-tag' });
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
				void new SDKInstallModal(app, agent.provider, pluginDir)
					.waitForResult()
					.then((installed: boolean) => { if (installed) refreshDisplay(); });
			});
		}

		// Actions column
		const actionsCell = row.insertCell();
		actionsCell.addClass('ia-table-cell', 'ia-table-actions');

		const editBtn = actionsCell.createEl('button', { text: 'Edit' });
		editBtn.addClass('ia-button', 'ia-button--ghost');
		editBtn.addEventListener('click', () => {
			new CLIAgentEditModal(app, agent, pluginDir, async (updated) => {
				const idx = (plugin.settings.cliAgents ?? []).findIndex(a => a.id === updated.id);
				if (idx !== -1) {
					plugin.settings.cliAgents[idx] = updated;
					await plugin.saveSettings();
					refreshDisplay();
				}
			}).open();
		});

		const deleteBtn = actionsCell.createEl('button', { text: 'Delete' });
		deleteBtn.addClass('ia-button', 'ia-button--danger');
		deleteBtn.addEventListener('click', () => {
			void (async () => {
				if (await showConfirm(app, `Delete CLI agent "${agent.name}"?`)) {
					const idx = (plugin.settings.cliAgents ?? []).findIndex(a => a.id === agent.id);
					if (idx !== -1) {
						plugin.settings.cliAgents.splice(idx, 1);
						await plugin.saveSettings();
						refreshDisplay();
					}
				}
			})();
		});
	}
}

// ─── CLI Detection Helpers ───────────────────────────────────────────

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

function sdkStatusLabel(status: SDKInstallStatus): string {
	switch (status) {
		case 'installed': return 'Installed';
		case 'outdated': return 'Outdated';
		case 'not-installed': return 'Not installed';
	}
}
