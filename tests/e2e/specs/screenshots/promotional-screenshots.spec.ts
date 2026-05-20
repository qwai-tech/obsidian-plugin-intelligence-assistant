/**
 * Promotional Screenshots v2 — Full-screen, maximum impact
 * Run: npm run test:e2e -- --spec tests/e2e/specs/screenshots/promotional-screenshots.spec.ts
 *
 * Strategy:
 *  - Full 1440×900 window screenshots — show Obsidian integration, not just chat
 *  - Collapse file-explorer sidebar so editor + chat fill the window
 *  - Scroll chat to assistant message start so the AI response is always the hero
 *  - Agent trace rendered order:0 (before response bubble) = steps → result flow
 *  - Shot 3 uses an injected mock context menu (reliable vs. native right-click)
 */

import * as path from 'path';
import * as fs from 'fs';
import { openChatView, navigateToPluginSettings, closeSettings, executeCommand } from '../../utils/actions';
import { SELECTORS } from '../../utils/selectors';

const OUT = path.resolve(__dirname, '../../../../docs/promotional/screenshots/real');

const save = async (name: string) => {
    await browser.pause(1000);
    await browser.saveScreenshot(path.join(OUT, name));
    console.log(`📸  ${name}`);
};

// ── Types ────────────────────────────────────────────────────────────────────

type MsgRole = 'user' | 'assistant';
interface Msg {
    role: MsgRole;
    html: string;
    time?: string;
    badges?: Array<{ label: string; value: string }>;
    rag?: Array<{ file: string; score: string }>;
    agentTrace?: Array<{ tool: string; args: string; result: string; status: 'success' | 'running' }>;
}

// ── Layout helpers ───────────────────────────────────────────────────────────

/** Collapse the left file-explorer panel so editor + chat fill the window */
async function collapseLeftSidebar() {
    await browser.execute(() => {
        // Hide file-explorer panel
        const app = (window as any).app;
        try { if (app?.workspace?.leftSplit) { app.workspace.leftSplit.collapse(); } } catch {}
        const split = document.querySelector<HTMLElement>('.workspace-split.mod-left-split');
        if (split) { split.style.width = '0'; split.style.minWidth = '0'; split.style.overflow = 'hidden'; }
        // Also hide the leftmost ribbon (icon strip) for a clean edge-to-edge look
        const ribbon = document.querySelector<HTMLElement>('.workspace-ribbon.mod-left');
        if (ribbon) ribbon.style.display = 'none';
    });
    await browser.pause(500);
}

/** Set the right sidebar (chat panel) to exactly 33.33% of the window width */
async function setRightPanelWidth() {
    await browser.execute(() => {
        const right = document.querySelector<HTMLElement>('.workspace-split.mod-right-split');
        if (right) {
            right.style.width    = '40vw';
            right.style.minWidth = '40vw';
            right.style.maxWidth = '40vw';
            right.style.flex     = '0 0 40vw';
        }
    });
    await browser.pause(300);
}

// ── Chat injection ───────────────────────────────────────────────────────────

async function injectChat(msgs: Msg[]) {
    // Step 1: inject a <style> block so trace/citation elements use CSS classes,
    //         not a soup of inline styles that are hard to maintain.
    await browser.execute(() => {
        const ID = 'ia-promo-styles';
        if (document.getElementById(ID)) return;
        const s = document.createElement('style');
        s.id = ID;
        s.textContent = `
/* ── promo injection typography ── */
.ia-promo-inject .message-content { font-size:13.5px; line-height:1.65; }
.ia-promo-inject .message-content p { margin:0 0 6px; }
.ia-promo-inject .message-content p:last-child { margin-bottom:0; }
.ia-promo-inject .message-content ol,
.ia-promo-inject .message-content ul { margin:6px 0; padding-left:20px; }
.ia-promo-inject .message-content li { margin:4px 0; line-height:1.6; }
.ia-promo-inject .message-content strong { color:var(--text-normal); }

/* ── agent trace ── */
.ia-promo-trace {
    order:0; margin:0 0 10px;
    border:1px solid var(--background-modifier-border);
    border-radius:10px; overflow:hidden;
}
.ia-promo-trace-hdr {
    padding:8px 14px;
    background:var(--background-secondary-alt,#131313);
    display:flex; align-items:center; gap:8px;
    font-size:11.5px; font-weight:600; color:var(--text-muted);
    border-bottom:1px solid var(--background-modifier-border);
}
.ia-promo-trace-badge {
    margin-left:auto; font-size:10px; font-weight:700;
    background:rgba(74,222,128,0.15); color:#4ade80;
    padding:2px 9px; border-radius:999px;
    border:1px solid rgba(74,222,128,0.3);
}
.ia-promo-trace-step {
    padding:8px 14px 8px 12px;
    border-top:1px solid var(--background-modifier-border);
    display:flex; gap:11px; align-items:flex-start;
}
.ia-promo-trace-dot {
    width:8px; height:8px; border-radius:50%;
    background:#4ade80; flex-shrink:0; margin-top:4px;
    box-shadow:0 0 6px rgba(74,222,128,0.45);
}
.ia-promo-trace-body { flex:1; min-width:0; }
.ia-promo-trace-tool {
    font-family:var(--font-monospace,monospace);
    font-size:11.5px; font-weight:700; color:var(--text-normal);
}
.ia-promo-trace-args {
    font-family:var(--font-monospace,monospace);
    font-size:10.5px; color:var(--text-faint); margin-top:2px;
}
.ia-promo-trace-result {
    font-size:10.5px; color:#4ade80; margin-top:3px; font-weight:500;
}

/* ── RAG source cards ── */
.ia-promo-sources {
    margin-top:12px; padding-top:10px;
    border-top:1px solid var(--background-modifier-border);
}
.ia-promo-sources-label {
    font-size:9.5px; text-transform:uppercase;
    letter-spacing:0.08em; color:var(--text-faint);
    font-weight:700; margin-bottom:7px;
}
.ia-promo-source-card {
    display:flex; align-items:center; gap:8px;
    padding:6px 10px; border-radius:7px;
    background:var(--background-secondary);
    border:1px solid var(--background-modifier-border);
    margin-bottom:4px;
}
.ia-promo-source-icon { color:#a78bfa; flex-shrink:0; }
.ia-promo-source-name {
    flex:1; font-size:12px; color:var(--text-normal); font-weight:500;
}
.ia-promo-source-score {
    font-size:10.5px; font-weight:700; color:#a78bfa;
    background:rgba(124,58,237,0.12); border:1px solid rgba(124,58,237,0.25);
    padding:2px 8px; border-radius:999px;
}
        `;
        document.head.appendChild(s);
    });

    await browser.execute((messages: Msg[]) => {
        const container = document.querySelector<HTMLElement>('.chat-messages');
        if (!container) return;

        const empty = container.querySelector<HTMLElement>('.ia-chat-empty-state');
        if (empty) empty.style.display = 'none';
        container.querySelectorAll('.ia-promo-inject').forEach(el => el.remove());

        messages.forEach((msg) => {
            const isUser = msg.role === 'user';

            const wrap = document.createElement('div');
            wrap.className = `ia-chat-message chat-message message-${msg.role} ia-chat-message--${msg.role} ia-promo-inject`;

            const row = document.createElement('div');
            row.className = 'ia-chat-message__row message-row';

            // Avatar — let CSS classes handle background; we only supply the icon/letter
            const avatar = document.createElement('div');
            avatar.className = 'ia-chat-message__avatar message-avatar' + (isUser ? '' : ' ia-provider-avatar');
            if (isUser) {
                avatar.innerHTML = `<span style="font-size:11px;font-weight:700;color:#fff;">L</span>`;
            } else {
                avatar.style.cssText = 'background:linear-gradient(135deg,#2e1065 0%,#4c1d95 100%);border:1px solid rgba(139,92,246,0.5);';
                avatar.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="#c4b5fd">
                    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.3L12 17 5.8 21.2l2.4-7.3L2 9.4h7.6L12 2z"/>
                </svg>`;
            }

            const body = document.createElement('div');
            body.className = 'ia-chat-message__body message-body';
            body.setAttribute('data-message-body', 'true');

            const header = document.createElement('div');
            header.className = 'ia-chat-message__header message-meta';

            const label = document.createElement('div');
            label.className = 'ia-chat-message__label message-name';
            label.textContent = isUser ? 'You' : 'Assistant';

            const statusSpan = document.createElement('span');
            statusSpan.className = 'ia-chat-message__status ia-hidden';

            const timestamp = document.createElement('div');
            timestamp.className = 'ia-chat-message__timestamp message-timestamp';
            timestamp.textContent = msg.time || '10:24';

            if (!isUser && msg.badges?.length) {
                const badgeRow = document.createElement('div');
                badgeRow.className = 'ia-chat-message__badges message-meta-badges';
                (msg as any).badges.forEach((b: any) => {
                    const badge = document.createElement('span');
                    badge.className = 'ia-chat-message__badge';
                    const val = document.createElement('span');
                    val.className = 'ia-chat-message__badge-value';
                    val.textContent = b.value;
                    badge.appendChild(val);
                    badgeRow.appendChild(badge);
                });
                header.appendChild(badgeRow);
            }

            header.append(label, statusSpan, timestamp);
            body.appendChild(header);

            // Agent trace — order:0 so it appears ABOVE the content bubble
            if (!isUser && (msg as any).agentTrace?.length) {
                const trace = document.createElement('div');
                trace.className = 'ia-agent-trace-container ia-promo-trace';

                const hdr = document.createElement('div');
                hdr.className = 'ia-promo-trace-hdr';
                hdr.innerHTML = `
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                         stroke="#60a5fa" stroke-width="2" stroke-linecap="round"
                         style="flex-shrink:0">
                        <circle cx="12" cy="12" r="9"/>
                        <polyline points="12,7 12,12 15,14"/>
                    </svg>
                    <span>Agent &middot; ${(msg as any).agentTrace.length} steps</span>
                    <span class="ia-promo-trace-badge">&#10003;&nbsp;Complete</span>`;
                trace.appendChild(hdr);

                (msg as any).agentTrace.forEach((step: any) => {
                    const stepEl = document.createElement('div');
                    stepEl.className = 'ia-promo-trace-step';

                    const dot = document.createElement('div');
                    dot.className = 'ia-promo-trace-dot';

                    const bdy = document.createElement('div');
                    bdy.className = 'ia-promo-trace-body';

                    const toolEl = document.createElement('div');
                    toolEl.className = 'ia-promo-trace-tool';
                    toolEl.textContent = step.tool;

                    const argsEl = document.createElement('div');
                    argsEl.className = 'ia-promo-trace-args';
                    argsEl.textContent = step.args;

                    const resEl = document.createElement('div');
                    resEl.className = 'ia-promo-trace-result';
                    resEl.textContent = step.result;

                    bdy.append(toolEl, argsEl, resEl);
                    stepEl.append(dot, bdy);
                    trace.appendChild(stepEl);
                });

                body.appendChild(trace);
            }

            // Content bubble
            const content = document.createElement('div');
            content.className = 'ia-chat-message__content message-content';
            content.setAttribute('data-message-content', 'true');
            content.innerHTML = (msg as any).html;

            // RAG source cards — rendered as a "Sources" section below content
            if (!isUser && (msg as any).rag?.length) {
                const sources = document.createElement('div');
                sources.className = 'ia-promo-sources';

                const lbl = document.createElement('div');
                lbl.className = 'ia-promo-sources-label';
                lbl.textContent = 'Sources';
                sources.appendChild(lbl);

                (msg as any).rag.forEach((r: any) => {
                    const card = document.createElement('div');
                    card.className = 'ia-promo-source-card';
                    card.innerHTML = `
                        <svg class="ia-promo-source-icon" width="13" height="13"
                             viewBox="0 0 16 16" fill="currentColor">
                            <path d="M2 2h7l3 3v9H2V2zm2 2v8h6V6H8V4H4z"/>
                        </svg>
                        <span class="ia-promo-source-name">${r.file}</span>
                        <span class="ia-promo-source-score">${r.score}</span>`;
                    sources.appendChild(card);
                });

                content.appendChild(sources);
            }

            body.appendChild(content);

            // Action bar (hover-reveal, copy button)
            const actions = document.createElement('div');
            actions.className = 'ia-chat-message__actions message-actions';
            const cg = document.createElement('div');
            cg.className = 'ia-chat-copy-group';
            const cb = document.createElement('button');
            cb.className = 'ia-chat-copy-btn';
            cb.textContent = 'Copy';
            cg.appendChild(cb);
            actions.appendChild(cg);
            body.appendChild(actions);

            row.append(avatar, body);
            wrap.appendChild(row);
            container.appendChild(wrap);
        });

        // Scroll so the assistant message is visible from the top
        const assistantEl = container.querySelector<HTMLElement>('.ia-chat-message--assistant.ia-promo-inject');
        if (assistantEl) {
            const cRect = container.getBoundingClientRect();
            const aRect = assistantEl.getBoundingClientRect();
            container.scrollTop += (aRect.top - cRect.top) - 8;
        } else {
            container.scrollTop = 0;
        }
    }, msgs);
    await browser.pause(700);
}


// ── Open vault note ──────────────────────────────────────────────────────────

async function openNote(name: string) {
    await browser.keys(['Meta', 'o']);
    await browser.pause(600);
    const input = await $('input.prompt-input');
    if (await input.isExisting()) {
        await input.setValue(name);
        await browser.pause(500);
        await browser.keys('Enter');
        await browser.pause(1400);
    }
}

// ── Inject mock Quick Actions context menu ───────────────────────────────────
// The native right-click context menu is unreliable in headless/automated Electron.
// We inject a DOM element using Obsidian's exact .menu class hierarchy so it
// picks up the native Obsidian menu CSS and looks pixel-authentic.

async function injectQuickActionsMenu() {
    await browser.execute(() => {
        document.querySelectorAll('.ia-promo-menu').forEach(el => el.remove());

        const editor = document.querySelector<HTMLElement>('.cm-content');
        if (!editor) return;

        const rect = editor.getBoundingClientRect();
        const menuLeft = Math.round(rect.left + rect.width * 0.28);
        const menuTop  = Math.round(rect.top  + 140);

        const lightning = [
            '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"',
            ' fill="none" stroke="currentColor" stroke-width="2.5"',
            ' stroke-linecap="round" stroke-linejoin="round">',
            '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
            '</svg>',
        ].join('');

        const items = [
            { label: 'Improve writing',        focused: true  },
            { label: 'Summarize selection',     focused: false },
            { label: 'Translate to Chinese',    focused: false },
            { label: 'Explain in simple terms', focused: false },
        ];

        const menu = document.createElement('div');
        menu.className = 'menu ia-promo-menu';
        menu.style.cssText = [
            `position:fixed`,
            `left:${menuLeft}px`,
            `top:${menuTop}px`,
            `z-index:99999`,
            `min-width:210px`,
        ].join(';');

        items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'menu-item' + (item.focused ? ' is-focused' : '');
            el.innerHTML = [
                `<div class="menu-item-icon" style="color:#f59e0b;">${lightning}</div>`,
                `<div class="menu-item-title">${item.label}</div>`,
            ].join('');
            menu.appendChild(el);
        });

        document.body.appendChild(menu);
    });
    await browser.pause(500);
}

async function removeInjectedMenu() {
    await browser.execute(() => { document.querySelectorAll('.ia-promo-menu').forEach(el => el.remove()); });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Promotional Screenshots v2 — Full-screen, Maximum Impact', () => {

    before(async () => {
        fs.mkdirSync(OUT, { recursive: true });
        console.log(`\n📁  Output: ${OUT}\n`);

        // electron.remote.getCurrentWindow().setFullScreen(true) is confirmed available
        // in Obsidian's renderer. This triggers macOS native fullscreen (hides title bar,
        // fills entire 1680×945 display).
        await browser.execute(() => {
            try {
                const e = (window as any).require('electron');
                e.remote.getCurrentWindow().setFullScreen(true);
            } catch (_) {}
        });
        // Wait for macOS fullscreen slide animation
        await browser.pause(2000);
        // Left sidebar + ribbon: collapsed for ALL shots
        await collapseLeftSidebar();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SHOT 1 · RAG Hero
    // Layout: sidebar collapsed → editor shows note content → chat cites it
    // Story:  "Your AI assistant that actually reads your vault"
    // ─────────────────────────────────────────────────────────────────────────
    it('Shot 1 · RAG — AI that knows your vault', async () => {
        await openNote('PKM Principles');
        await openChatView();
        await setRightPanelWidth();
        await browser.pause(800);

        await injectChat([
            {
                role: 'user',
                time: '10:12',
                html: '<p>What should I read next based on my reading list and PKM goals?</p>',
            },
            {
                role: 'assistant',
                time: '10:12',
                html: [
                    '<p>You\'re mid-way through <strong>Building a Second Brain</strong> (ch. 7/10). Based on your principle to <em>build for retrieval</em>, finish it first — Forte\'s PARA method directly applies.</p>',
                    '<p>After that, from your queue:</p>',
                    '<ol style="padding-left:20px;margin:6px 0;">',
                    '  <li><strong>Attention is All You Need</strong> — foundational for everything AI-related in your LLM notes</li>',
                    '  <li><strong>RAG for NLP</strong> — maps directly to how your vault can power retrieval-augmented generation</li>',
                    '</ol>',
                ].join(''),
                badges: [
                    { label: '', value: '✦ deepseek-chat' },
                    { label: '', value: '📚 RAG · 2 notes' },
                    { label: '', value: '512 tokens' },
                ],
                rag: [
                    { file: 'Reading List.md',   score: '0.94' },
                    { file: 'PKM Principles.md', score: '0.91' },
                ],
            },
            {
                role: 'user',
                time: '10:16',
                html: '<p>Remind me — what\'s Progressive Summarization exactly?</p>',
            },
            {
                role: 'assistant',
                time: '10:16',
                html: [
                    '<p>From your notes — four compression layers, applied in order:</p>',
                    '<ol style="padding-left:20px;margin:6px 0;">',
                    '  <li><strong>Raw capture</strong> — full source, zero judgment</li>',
                    '  <li><strong>Highlights</strong> — pull out key passages</li>',
                    '  <li><strong>Bold highlights</strong> — the single most important idea per passage</li>',
                    '  <li><strong>Executive summary</strong> — 2–3 sentences at the top</li>',
                    '</ol>',
                ].join(''),
                badges: [
                    { label: '', value: '✦ deepseek-chat' },
                    { label: '', value: '📚 RAG · 1 note' },
                    { label: '', value: '198 tokens' },
                ],
                rag: [
                    { file: 'PKM Principles.md', score: '0.98' },
                ],
            },
        ]);

        await save('shot1-rag-hero.png');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SHOT 2 · Agent in Action
    // Layout: sidebar collapsed → wide chat panel
    // Story:  "Autonomous agent — searches, reads, writes across your vault"
    // ─────────────────────────────────────────────────────────────────────────
    it('Shot 2 · Agent — autonomous multi-step task', async () => {
        await openChatView();
        await setRightPanelWidth();
        await browser.pause(600);

        // Try to switch to Agent mode button
        try {
            const agentBtn = await $('button=Agent');
            if (await agentBtn.isExisting()) { await agentBtn.click(); await browser.pause(400); }
        } catch {}

        await injectChat([
            {
                role: 'user',
                time: '11:42',
                html: '<p>Find all my transformer-related notes and create a concise summary note I can reference quickly.</p>',
            },
            {
                role: 'assistant',
                time: '11:43',
                agentTrace: [
                    { tool: 'vault_search', args: 'query: "transformer attention" · top_k: 8',  result: '↳ 3 notes matched',                  status: 'success' },
                    { tool: 'read_note',    args: 'path: LLM Architecture.md',                  result: '↳ 1,104 tokens read',                status: 'success' },
                    { tool: 'read_note',    args: 'path: Reading List.md',                       result: '↳ 312 tokens read',                  status: 'success' },
                    { tool: 'create_note',  args: 'path: Transformer Quick Reference.md',        result: '↳ Note created (487 words)',          status: 'success' },
                ],
                html: [
                    '<p>Created <strong>Transformer Quick Reference.md</strong> with 4 sections:</p>',
                    '<ul style="padding-left:20px;margin:6px 0;">',
                    '  <li><strong>Core mechanism</strong> — attention weights, KV cache, context limits</li>',
                    '  <li><strong>Model families</strong> — GPT (decoder), BERT (encoder), T5 (enc-dec), Mamba (SSM)</li>',
                    '  <li><strong>Inference tricks</strong> — <code>INT8</code> quant, Flash Attention, speculative decoding</li>',
                    '  <li><strong>2025–26 trends</strong> — MCP tooling, MoE scaling, 1M+ context windows</li>',
                    '</ul>',
                ].join(''),
                badges: [
                    { label: '', value: '✦ deepseek-chat' },
                    { label: '', value: '⚡ Agent · 4 steps' },
                    { label: '', value: '3,218 tokens' },
                ],
            },
        ]);

        await save('shot2-agent-action.png');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SHOT 3 · Quick Actions context menu
    // Layout: full sidebar visible, note in editor, injected context menu
    // Story:  "Select any text → right-click → one-tap AI transformation"
    // ─────────────────────────────────────────────────────────────────────────
    it('Shot 3 · Quick Actions — editor context menu', async () => {
        await openNote('PKM Principles');
        await browser.pause(1000);

        // Select text in editor so the highlight is visible
        const editor = await $('.cm-content');
        if (await editor.isExisting()) {
            await editor.click();
            await browser.pause(200);
            // Triple-click selects the current line
            await editor.click({ x: 80, y: 60 });
            await browser.pause(100);
            await browser.keys(['Home']);
            await browser.pause(50);
            await browser.keys(['Shift', 'End']);
            await browser.pause(200);
        }

        await injectQuickActionsMenu();
        await save('shot3-quick-actions-menu.png');

        await removeInjectedMenu();
        await browser.keys('Escape');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SHOT 4 · Full window overview
    // Layout: default (sidebar visible), note + chat split
    // Story:  "Obsidian + AI — seamlessly integrated"
    // ─────────────────────────────────────────────────────────────────────────
    it('Shot 4 · Full window — editor + chat split view', async () => {
        await openNote('LLM Architecture');
        await openChatView();
        await setRightPanelWidth();
        await browser.pause(800);

        await injectChat([
            {
                role: 'user',
                time: '14:05',
                html: '<p>Explain KV cache in simple terms based on my LLM notes.</p>',
            },
            {
                role: 'assistant',
                time: '14:05',
                html: [
                    '<p>From your notes: KV cache stores the <code>key</code> and <code>value</code> tensors computed during the attention pass — so the model doesn\'t recompute them for every new token.</p>',
                    '<p>Complexity difference:</p>',
                    '<ul style="padding-left:20px;margin:5px 0;">',
                    '  <li>Without cache: <code>O(n²)</code> attention cost per new token</li>',
                    '  <li>With cache: <code>O(n)</code> — only the new token attends to all prior KV pairs</li>',
                    '</ul>',
                    '<p>Trade-off: memory grows linearly with context length — at 128 k tokens this becomes significant.</p>',
                ].join(''),
                badges: [
                    { label: '', value: '✦ deepseek-chat' },
                    { label: '', value: '📚 RAG · 1 note' },
                    { label: '', value: '389 tokens' },
                ],
                rag: [{ file: 'LLM Architecture.md', score: '0.97' }],
            },
            {
                role: 'user',
                time: '14:09',
                html: '<p>What about Flash Attention — how does it help with the memory issue?</p>',
            },
            {
                role: 'assistant',
                time: '14:09',
                html: [
                    '<p><strong>Flash Attention</strong> is IO-aware — it tiles the attention matrix to stay inside SRAM instead of repeatedly reading from HBM:</p>',
                    '<ul style="padding-left:20px;margin:5px 0;">',
                    '  <li>2–4× faster than standard attention</li>',
                    '  <li>No quality loss — mathematically exact</li>',
                    '  <li>Enables longer contexts without OOM</li>',
                    '</ul>',
                ].join(''),
                badges: [
                    { label: '', value: '✦ deepseek-chat' },
                    { label: '', value: '📚 RAG · 1 note' },
                    { label: '', value: '241 tokens' },
                ],
                rag: [{ file: 'LLM Architecture.md', score: '0.95' }],
            },
        ]);

        await save('shot4-full-window.png');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SHOT 5 · Settings — LLM Providers
    // ─────────────────────────────────────────────────────────────────────────
    it('Shot 5 · Settings — providers configured', async () => {
        await navigateToPluginSettings();
        await browser.pause(1200);

        const llmTab = await $(SELECTORS.tabs.llm);
        if (await llmTab.isExisting()) {
            await llmTab.click();
            await browser.pause(1000);
        }

        await save('shot5-providers.png');
        await closeSettings();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SHOT 6 · Settings — Quick Actions
    // ─────────────────────────────────────────────────────────────────────────
    it('Shot 6 · Settings — Quick Actions tab', async () => {
        await navigateToPluginSettings();
        await browser.pause(1200);

        const qaTab = await $(SELECTORS.tabs.quickActions);
        if (await qaTab.isExisting()) {
            await qaTab.click();
            await browser.pause(1000);
        }

        await save('shot6-quick-actions-settings.png');
        await closeSettings();
    });

});
