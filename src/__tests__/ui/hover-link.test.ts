import {
	HOVER_LINK_SOURCE,
	registerChatHoverLinkSource,
	triggerHoverLink,
	internalLinktextFromEvent,
	openClickedInternalLink,
} from '@/ui/chat/hover-link';

describe('registerChatHoverLinkSource', () => {
	it('registers the plugin as a hover-link source with the expected payload', () => {
		const calls: Array<[string, unknown]> = [];
		const plugin = {
			registerHoverLinkSource: (id: string, info: unknown) => calls.push([id, info]),
			app: { workspace: {} as never },
		};
		registerChatHoverLinkSource(plugin);
		expect(calls).toHaveLength(1);
		expect(calls[0][0]).toBe(HOVER_LINK_SOURCE);
		expect(calls[0][1]).toEqual({ display: 'Intelligence Assistant', defaultMod: true });
	});
});

describe('triggerHoverLink', () => {
	it('fires the workspace hover-link trigger with the full payload', () => {
		const triggered: Array<{ name: string; payload: Record<string, unknown> }> = [];
		const workspace = {
			trigger: (name: string, payload: Record<string, unknown>) => {
				triggered.push({ name, payload });
			},
		};
		const targetEl = document.createElement('a');
		const event = new MouseEvent('mouseover');
		const fired = triggerHoverLink(workspace as never, {
			event,
			hoverParent: document.createElement('div'),
			targetEl,
			linktext: 'My Note',
			sourcePath: 'chat.md',
		});
		expect(fired).toBe(true);
		expect(triggered).toHaveLength(1);
		expect(triggered[0].name).toBe('hover-link');
		expect(triggered[0].payload).toMatchObject({
			source: HOVER_LINK_SOURCE,
			targetEl,
			linktext: 'My Note',
			sourcePath: 'chat.md',
			event,
		});
	});

	it('does not fire when the linktext is blank', () => {
		let fired = false;
		const workspace = { trigger: () => { fired = true; } };
		const result = triggerHoverLink(workspace as never, {
			event: new MouseEvent('mouseover'),
			hoverParent: document.createElement('div'),
			targetEl: document.createElement('a'),
			linktext: '   ',
			sourcePath: '',
		});
		expect(result).toBe(false);
		expect(fired).toBe(false);
	});
});

describe('internalLinktextFromEvent', () => {
	it('extracts data-href from an internal-link anchor', () => {
		const anchor = document.createElement('a');
		anchor.className = 'internal-link';
		anchor.setAttribute('data-href', 'Target Note');
		anchor.textContent = 'alias';
		const hit = internalLinktextFromEvent(anchor);
		expect(hit?.linktext).toBe('Target Note');
		expect(hit?.el).toBe(anchor);
	});

	it('resolves from a child node of the anchor', () => {
		const anchor = document.createElement('a');
		anchor.className = 'internal-link';
		anchor.setAttribute('data-href', 'Parent');
		const span = document.createElement('span');
		anchor.appendChild(span);
		expect(internalLinktextFromEvent(span)?.linktext).toBe('Parent');
	});

	it('returns null for non-internal-link targets', () => {
		const div = document.createElement('div');
		expect(internalLinktextFromEvent(div)).toBeNull();
		expect(internalLinktextFromEvent(null)).toBeNull();
	});
});

describe('openClickedInternalLink', () => {
	function clickOn(target: HTMLElement, init: MouseEventInit = {}): MouseEvent {
		const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
		Object.defineProperty(event, 'target', { value: target });
		return event;
	}

	it('opens the note an internal link points to, in place of following its href', () => {
		const workspace = { openLinkText: jest.fn(async () => undefined) };
		const anchor = document.createElement('a');
		anchor.className = 'internal-link';
		anchor.setAttribute('data-href', 'qa-source');
		const event = clickOn(anchor);

		expect(openClickedInternalLink(workspace, event, 'chat.md')).toBe(true);

		expect(workspace.openLinkText).toHaveBeenCalledWith('qa-source', 'chat.md', false);
		expect(event.defaultPrevented).toBe(true);
	});

	it('opens in a new tab on a modifier click', () => {
		const workspace = { openLinkText: jest.fn(async () => undefined) };
		const anchor = document.createElement('a');
		anchor.className = 'internal-link';
		anchor.setAttribute('data-href', 'qa-source');

		openClickedInternalLink(workspace, clickOn(anchor, { metaKey: true, ctrlKey: true }), '');

		expect(workspace.openLinkText).toHaveBeenCalledWith('qa-source', '', true);
	});

	it('ignores clicks outside internal links', () => {
		const workspace = { openLinkText: jest.fn() };

		expect(openClickedInternalLink(workspace, clickOn(document.createElement('span')), '')).toBe(false);
		expect(workspace.openLinkText).not.toHaveBeenCalled();
	});
});
