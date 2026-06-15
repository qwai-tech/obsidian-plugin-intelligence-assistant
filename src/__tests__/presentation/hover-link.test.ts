import {
	HOVER_LINK_SOURCE,
	registerChatHoverLinkSource,
	triggerHoverLink,
	internalLinktextFromEvent,
} from '@/presentation/chat/hover-link';

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
