/**
 * Base Controller
 * Abstract base class for all chat controllers
 */

import type { App } from 'obsidian';
import type { PluginHost } from '@/ui/plugin-host';
import type { ChatViewState } from '@/ui/state/chat-view-state';

export abstract class BaseController {
	constructor(
		protected _app: App,
		protected _plugin: PluginHost,
		protected state: ChatViewState
	) {}

	/**
	 * Initialize controller
	 */
	abstract initialize(): Promise<void>;

	/**
	 * Cleanup resources
	 */
	abstract cleanup(): void;
}
