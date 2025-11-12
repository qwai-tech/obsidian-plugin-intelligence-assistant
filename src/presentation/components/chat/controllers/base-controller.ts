/**
 * Base Controller
 * Abstract base class for all chat controllers
 */

import type { App } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import type { ChatViewState } from '@/presentation/state/chat-view-state';

export abstract class BaseController {
	constructor(
		protected app: App,
		protected plugin: IntelligenceAssistantPlugin,
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
