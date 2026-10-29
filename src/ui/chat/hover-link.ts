import type { Component, Workspace } from 'obsidian';

/** The hover-link source id this plugin registers with the Page Preview plugin. */
export const HOVER_LINK_SOURCE = 'intelligence-assistant';

/**
 * Minimal surface of a Plugin that the hover-link wiring needs. Kept narrow so the
 * registration helper is easy to reason about (and the plugin satisfies it).
 */
export interface HoverLinkPlugin {
	registerHoverLinkSource(id: string, info: { display: string; defaultMod: boolean }): void;
	app: { workspace: Workspace };
}

/**
 * Register this plugin as a hover-link source with Obsidian's core "Page preview"
 * plugin. Once registered, firing the workspace `hover-link` trigger with our
 * source id makes Obsidian render its native HoverPopover for the target link.
 */
export function registerChatHoverLinkSource(plugin: HoverLinkPlugin): void {
	plugin.registerHoverLinkSource(HOVER_LINK_SOURCE, {
		display: 'Intelligence Assistant',
		defaultMod: true,
	});
}

/**
 * Fire the workspace `hover-link` trigger for a single internal link. Extracted as
 * a pure function (it only needs a workspace-like object with `trigger`) so the
 * payload shape is unit-testable without a live view. Returns true when a trigger
 * was fired, false when there was no linktext to preview.
 */
export function triggerHoverLink(
	workspace: Pick<Workspace, 'trigger'>,
	args: {
		event: MouseEvent;
		hoverParent: Component | HTMLElement;
		targetEl: HTMLElement;
		linktext: string;
		sourcePath: string;
	},
): boolean {
	const linktext = args.linktext.trim();
	if (!linktext) return false;
	workspace.trigger('hover-link', {
		event: args.event,
		source: HOVER_LINK_SOURCE,
		hoverParent: args.hoverParent,
		targetEl: args.targetEl,
		linktext,
		sourcePath: args.sourcePath,
	});
	return true;
}

/**
 * Resolve the linktext for a hovered element: the closest `a.internal-link`
 * ancestor's `data-href` (preferred) or text content. Returns null when the
 * hovered element is not part of an internal link.
 */
export function internalLinktextFromEvent(target: EventTarget | null): { el: HTMLElement; linktext: string } | null {
	if (!(target instanceof HTMLElement)) return null;
	const anchor = target.closest('a.internal-link');
	if (!(anchor instanceof HTMLElement)) return null;
	const linktext = anchor.getAttribute('data-href') || anchor.textContent || '';
	if (!linktext.trim()) return null;
	return { el: anchor, linktext };
}
