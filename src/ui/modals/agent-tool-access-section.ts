import { Setting, type ToggleComponent } from 'obsidian';
import type { PluginHost } from '@/ui/plugin-host';
import type { BuiltInToolConfig, CLIToolConfig, MCPServerConfig } from '@/features/tools';
import { t } from '@/i18n';
import type { ToolAccessEditor } from '@/features/agent';

export class AgentToolAccessSection {
	constructor(
		private readonly plugin: PluginHost,
		private readonly access: ToolAccessEditor,
	) {}

	render(container: HTMLElement): void {
		// Built-in tools
		new Setting(container)
			.setName(t('modals.agentEdit.tools.builtIn.name'))
			.setDesc(t('modals.agentEdit.tools.builtIn.desc'));

		this.plugin.settings.builtInTools.forEach((tool: BuiltInToolConfig) => {
			const fallbackName = tool.type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
			const toolNameKey = `settings.tools.builtIn.toolNames.${tool.type}`;
			new Setting(container)
				.setName(t(toolNameKey, { defaultValue: fallbackName }))
				.addToggle(toggle => toggle
					.setValue(this.access.hasTool('builtin:builtin', `builtin:builtin:${tool.type}`))
					.onChange(value => this.access.setTool('builtin:builtin', `builtin:builtin:${tool.type}`, value, this.enabledBuiltinToolIds())));
		});

		// CLI Tools
		const cliTools = this.plugin.settings.cliTools ?? [];
		const enabledCLITools = cliTools.filter(tool => tool.enabled);
		if (enabledCLITools.length > 0) {
			const cliToolToggles: Array<{ id: string; toggle: ToggleComponent }> = [];

			// Master toggle reflects the aggregate state: ON iff every enabled
			// CLI tool is in this agent's toolAccess. Flipping ON adds them
			// all; flipping OFF removes them all.
			new Setting(container)
				.setName(t('modals.agentEdit.tools.cli.name'))
				.setDesc(t('modals.agentEdit.tools.cli.desc'))
				.addToggle(toggle => {
					toggle.setValue(enabledCLITools.every(tool => this.access.includesSource(`cli:${tool.id}`)));
					toggle.onChange(value => {
						for (const tool of enabledCLITools) {
							this.access.setWholeSource(`cli:${tool.id}`, value);
						}
						this.refreshCliPerToolToggles(cliToolToggles);
					});
				});

			// Individual tool toggles
			enabledCLITools.forEach((tool: CLIToolConfig) => {
				new Setting(container)
					.setName(`⌨️ ${tool.name}`)
					.setDesc(tool.description || tool.command)
					.addToggle(toggle => {
						toggle.setValue(this.access.includesSource(`cli:${tool.id}`));
						toggle.onChange(value => this.access.setWholeSource(`cli:${tool.id}`, value));
						cliToolToggles.push({ id: tool.id, toggle });
					});
			});
		} else {
			new Setting(container)
				.setName(t('modals.agentEdit.tools.cli.name'))
				.setDesc(t('modals.agentEdit.tools.cli.noTools'));
		}

		// MCP Servers
		new Setting(container).setName(t('modals.agentEdit.mcp.title')).setHeading();
		if (this.plugin.settings.mcpServers.length === 0) {
			const empty = container.createDiv('ia-table-subtext');
			empty.setText(t('modals.agentEdit.mcp.noServers'));
		} else {
			const mcpContainer = container.createDiv('ia-mcp-control');
			this.plugin.settings.mcpServers.forEach(server => {
				this.renderMcpServerControls(mcpContainer, server);
			});
		}
	}

	private enabledBuiltinToolIds(): string[] {
		return (this.plugin.settings.builtInTools ?? []).filter(tool => tool.enabled).map(tool => `builtin:builtin:${tool.type}`);
	}

	private mcpToolIds(server: string): string[] {
		const config = this.plugin.settings.mcpServers.find(candidate => candidate.name === server);
		return (config?.cachedTools ?? []).map(tool => `mcp:${server}:${tool.name}`);
	}

	private renderMcpServerControls(container: HTMLElement, server: MCPServerConfig) {
		const wrapper = container.createDiv('ia-mcp-server');
		const toolEntries: Array<{ toolName: string; toggle: ToggleComponent; statusEl: HTMLElement }> = [];
		const hasTools = Boolean(server.cachedTools && server.cachedTools.length > 0);
		let toolsContainer: HTMLElement | null = null;
		// Expand the tool list if the agent has any per-tool MCP overrides
		// for this server (array form) — otherwise keep it collapsed by default.
		const rule = this.access.rule(`mcp:${server.name}`);
		let toolsVisible = hasTools && Array.isArray(rule);

		const serverSetting = new Setting(wrapper)
			.setName(server.name)
			.setDesc(hasTools
				? t(server.cachedTools!.length === 1 ? 'modals.agentEdit.mcp.toolsCached' : 'modals.agentEdit.mcp.toolsCached_plural', { count: server.cachedTools!.length })
				: t('modals.agentEdit.mcp.noToolsCached'));
		serverSetting.settingEl.addClass('ia-mcp-server-header');

		if (hasTools) {
			serverSetting.addExtraButton(button => {
				const updateButton = () => {
					button.setIcon(toolsVisible ? 'chevron-up' : 'chevron-down');
					button.setTooltip(toolsVisible ? t('modals.agentEdit.mcp.hideTools') : t('modals.agentEdit.mcp.showTools'));
				};
				updateButton();
				button.onClick(() => {
					toolsVisible = !toolsVisible;
					if (toolsContainer) {
						toolsContainer.classList.toggle('is-collapsed', !toolsVisible);
					}
					updateButton();
				});
			});
		}

		const serverStatus = serverSetting.controlEl.createDiv('ia-mcp-status');
		const updateServerStatus = () => {
			const selected = this.access.grantsWholeSource(`mcp:${server.name}`);
			serverStatus.setText(selected ? t('modals.agentEdit.mcp.selected') : t('modals.agentEdit.mcp.notSelected'));
			serverStatus.toggleClass('is-selected', selected);
		};

		// Whole-server toggle: sets sources['mcp:server'] = 'all' or removes it.
		// When ON, per-tool toggles become disabled / forced-on. Flipping a
		// per-tool toggle OFF below switches the source to fine-grained mode
		// (an explicit array) — the server-level toggle then reflects "off".
		serverSetting.addToggle(toggle => {
			toggle.setValue(this.access.grantsWholeSource(`mcp:${server.name}`));
			toggle.onChange(value => {
				this.access.setWholeSource(`mcp:${server.name}`, value);
				this.syncMcpToolStates(toolEntries, server.name);
				updateServerStatus();
			});
		});
		updateServerStatus();

		if (hasTools) {
			const containerEl = wrapper.createDiv('ia-mcp-tools');
			toolsContainer = containerEl;
			containerEl.classList.toggle('is-collapsed', !toolsVisible);
			server.cachedTools!
				.slice()
				.sort((a, b) => a.name.localeCompare(b.name))
				.forEach(tool => {
					const toolName = tool.name;
					const toolSetting = new Setting(containerEl)
						.setName(toolName)
						.setDesc(tool.description || '');
					toolSetting.settingEl.addClass('ia-mcp-tool-item');
					const statusEl = toolSetting.controlEl.createDiv('ia-mcp-status');
					const entry = { toolName, toggle: undefined as unknown as ToggleComponent, statusEl };
					toolSetting.addToggle(toggle => {
						toggle.setValue(this.access.hasTool(`mcp:${server.name}`, `mcp:${server.name}:${toolName}`));
						toggle.onChange(value => {
							this.access.setTool(`mcp:${server.name}`, `mcp:${server.name}:${toolName}`, value, this.mcpToolIds(server.name));
							this.syncMcpToolStates(toolEntries, server.name);
							updateServerStatus();
						});
						entry.toggle = toggle;
					});
					toolEntries.push(entry);
				});
		} else {
			const note = wrapper.createDiv('ia-mcp-tools-empty');
			note.addClass('ia-table-subtext');
			note.setText(t('modals.agentEdit.mcp.noToolsAvailable'));
		}

		this.syncMcpToolStates(toolEntries, server.name);
	}

	private syncMcpToolStates(entries: Array<{ toolName: string; toggle: ToggleComponent; statusEl: HTMLElement }>, serverName: string) {
		const useAll = this.access.grantsWholeSource(`mcp:${serverName}`);
		entries.forEach(({ toolName, toggle, statusEl }) => {
			if (useAll) {
				if (!toggle.getValue()) {
					toggle.setValue(true);
				}
				toggle.setDisabled(true);
				statusEl.setText(t('modals.agentEdit.mcp.selected'));
				statusEl.toggleClass('is-selected', true);
			} else {
				toggle.setDisabled(false);
				const selected = this.access.hasTool(`mcp:${serverName}`, `mcp:${serverName}:${toolName}`);
				if (toggle.getValue() !== selected) {
					toggle.setValue(selected);
				}
				statusEl.setText(selected ? t('modals.agentEdit.mcp.selected') : t('modals.agentEdit.mcp.notSelected'));
				statusEl.toggleClass('is-selected', selected);
			}
		});
	}

	/**
	 * After the master CLI toggle flips, sync each per-tool toggle's
	 * displayed value to whatever toolAccess now says.
	 */
	private refreshCliPerToolToggles(entries: Array<{ id: string; toggle: ToggleComponent }>) {
		entries.forEach(({ id, toggle }) => {
			const desired = this.access.includesSource(`cli:${id}`);
			if (toggle.getValue() !== desired) {
				toggle.setValue(desired);
			}
		});
	}
}
