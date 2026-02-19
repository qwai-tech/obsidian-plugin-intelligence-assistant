/**
 * SDK Install Modal
 * Shows progress during SDK package installation.
 */

import { App, Modal } from 'obsidian';
import type { CLIAgentProvider } from '@/types';
import { CLI_PROVIDER_LABELS, type SDKPackageInfo } from '@/types/core/cli-agent';
import { SDK_PACKAGES, installSdk, type InstallProgress } from '@/infrastructure/cli-agent/sdk-installer';

export class SDKInstallModal extends Modal {
	private provider: CLIAgentProvider;
	private pluginDir: string;
	private abortController: AbortController;
	private logEl: HTMLElement | null = null;
	private statusEl: HTMLElement | null = null;
	private actionBar: HTMLElement | null = null;
	private resolvePromise: ((installed: boolean) => void) | null = null;

	constructor(app: App, provider: CLIAgentProvider, pluginDir: string) {
		super(app);
		this.provider = provider;
		this.pluginDir = pluginDir;
		this.abortController = new AbortController();
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		const info: SDKPackageInfo = SDK_PACKAGES[this.provider];
		const label = CLI_PROVIDER_LABELS[this.provider];

		contentEl.createEl('h2', { text: `Install ${label} SDK` });

		const descEl = contentEl.createEl('p');
		descEl.setText(`Package: ${info.packageName}@${info.version}`);

		const sizeEl = contentEl.createEl('p');
		sizeEl.setText(`Estimated download size: ~${String(info.estimatedSizeMB)} MB`);
		sizeEl.setCssProps({ color: 'var(--text-muted)', 'font-size': 'var(--font-ui-smaller)' });

		this.statusEl = contentEl.createDiv();
		this.statusEl.setText('Starting installation...');
		this.statusEl.setCssProps({ 'margin-top': '12px', 'font-weight': '600' });

		this.logEl = contentEl.createEl('pre');
		this.logEl.setCssProps({
			'max-height': '200px',
			'overflow-y': 'auto',
			'background': 'var(--background-secondary)',
			'padding': '8px',
			'border-radius': '4px',
			'font-size': 'var(--font-ui-smaller)',
			'white-space': 'pre-wrap',
			'word-break': 'break-all',
			'margin-top': '8px'
		});

		this.actionBar = contentEl.createDiv();
		this.actionBar.setCssProps({ display: 'flex', 'justify-content': 'flex-end', 'margin-top': '12px', gap: '8px' });

		const cancelBtn = this.actionBar.createEl('button', { text: 'Cancel' });
		cancelBtn.addClass('mod-warning');
		cancelBtn.addEventListener('click', () => {
			this.abortController.abort();
			this.close();
			this.resolvePromise?.(false);
		});

		this.startInstall();
	}

	private startInstall(): void {
		installSdk(
			this.pluginDir,
			this.provider,
			(progress: InstallProgress) => this.onProgress(progress),
			this.abortController.signal
		).then(() => {
			this.showDone(true);
		}).catch((err: unknown) => {
			if (!this.abortController.signal.aborted) {
				const msg = err instanceof Error ? err.message : String(err);
				this.showDone(false, msg);
			}
		});
	}

	private onProgress(progress: InstallProgress): void {
		if (this.statusEl) {
			const labels: Record<string, string> = {
				starting: 'Starting...',
				downloading: 'Downloading...',
				installing: 'Installing...',
				verifying: 'Verifying...',
				done: 'Done!',
				error: 'Error'
			};
			this.statusEl.setText(labels[progress.stage] ?? progress.stage);
		}
		if (this.logEl && progress.message) {
			this.logEl.appendText(progress.message + '\n');
			this.logEl.scrollTop = this.logEl.scrollHeight;
		}
	}

	private showDone(success: boolean, errorMsg?: string): void {
		if (this.statusEl) {
			this.statusEl.setText(success ? 'Installation complete' : 'Installation failed');
			this.statusEl.setCssProps({ color: success ? 'var(--text-success)' : 'var(--text-error)' });
		}
		if (!success && errorMsg && this.logEl) {
			this.logEl.appendText(`\nError: ${errorMsg}\n`);
		}
		if (this.actionBar) {
			this.actionBar.empty();
			const closeBtn = this.actionBar.createEl('button', { text: 'Close' });
			closeBtn.addEventListener('click', () => {
				this.close();
				this.resolvePromise?.(success);
			});
		}
	}

	onClose(): void {
		this.abortController.abort();
		this.contentEl.empty();
		this.resolvePromise?.(false);
	}

	/** Open modal and return whether installation succeeded */
	waitForResult(): Promise<boolean> {
		return new Promise((resolve) => {
			this.resolvePromise = resolve;
			this.open();
		});
	}
}
