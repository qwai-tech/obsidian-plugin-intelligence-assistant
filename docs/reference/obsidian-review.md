# Obsidian review findings — 2026-11-05

The reported source findings have been checked against the current code. The two forbidden rule suppressions, five unnecessary assertions and 22 DOM-helper findings are corrected. The two native `fetch` warnings and the system-capability notices remain visible and are explained below. This record is a local assessment, not an official scanner approval or a new release certificate.

## Source corrections

| Finding | Change |
|---|---|
| `runtime-clock.ts` disables `obsidianmd/prefer-window-timers` | Import the actual timer functions from `node:timers`, removing the disable/enable comments. These application-owned deadlines run in Node and Obsidian Desktop, independently of a view or popout window. The plugin remains desktop-only. |
| `ui-helpers.ts` disables `@typescript-eslint/no-deprecated` | Remove the obsolete `setWarning()` fallback. The manifest already requires Obsidian 1.13.0, which provides `setDestructive()`. |
| Five redundant assertions | Remove the assertions in context assembly, legacy settings narrowing, OpenAPI property inspection and the two CLI configuration builders. Runtime values and configuration defaults are unchanged. |
| DOM-helper warnings | Use `createDiv`, `createSpan`, `createEl` and `createFragment` in the eight reported UI files. Preserve the element tags, classes, text, attributes, order and event handlers. No layout, stylesheet or UI copy is changed. |
| Recurrence of forbidden suppressions | The project lint configuration now rejects disable comments for both reported rules. No production rule was relaxed. |

The existing Jest Obsidian fixture now exposes the supported detached DOM helpers and the modern destructive-button method. Production code does not fall back to native DOM creation or deprecated APIs to accommodate a test fixture.

## Retained network warnings

- [`http.ts`](../../packages/obsidian-llm/src/http.ts) contains the explicitly selected Node/fetch-compatible transport. Plugin startup installs the Obsidian transport instead; the Node transport is also used by command-line verification clients.
- [`obsidian-http.ts`](../../packages/obsidian-llm/src/obsidian-http.ts) uses `requestUrl` for buffered requests and native `fetch` for live SSE. A transport-level CORS failure can fall back to the existing buffered path. HTTP errors retain their error status.

The [official response interface](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts) exposes completed `text`, `json` and `arrayBuffer` bodies, without a live response-body stream. Replacing live SSE with `requestUrl` would change incremental output and cancellation behavior. Both calls remain plainly visible; this change does not disguise or suppress the review warnings. It does not claim universal endpoint/CORS compatibility.

The [official DOM rule](https://github.com/obsidianmd/eslint-plugin/blob/master/docs/rules/prefer-create-el.md) also prefers `createDiv` and `createSpan` over `createEl('div')` and `createEl('span')`. Several findings described as native DOM usage were actually these shorthand preferences.

## Capability assessment

| Scanner notice | Actual use and boundary |
|---|---|
| System identity / environment | Command lookup reads `HOME`; subprocess construction reads an explicit execution-related environment allowlist. No production calls to `os.hostname`, `os.userInfo` or `os.networkInterfaces` were found. This is not proof that explicitly enabled external commands cannot inspect identity information. |
| Direct filesystem access | The production `fs` import is in executable resolution, where `fs.access(..., X_OK)` probes candidate executable paths. Vault content persistence uses the vault adapter. Configured external commands can independently read or write other files with their operating-system permissions. |
| Shell / subprocess execution | CLI tools and MCP stdio integrations intentionally launch configured programs. CLI execution defaults to `shell: false`; shell mode is an explicit configuration. Newly added CLI presets remain disabled for review. Agent tool grants, argument handling, cancellation, output limits and timeouts apply, but this is not an operating-system sandbox. Existing enabled MCP servers may start from their saved configuration. |
| Vault enumeration | Search, tags, context selection and RAG indexing enumerate vault files to implement their features. Enumeration uses the vault API; configured indexing filters still apply. |
| Clipboard | Message/code copy buttons write text after a user action. The optional macOS `clipboard_paste` CLI preset can read clipboard contents when enabled, granted and invoked. Adding a preset leaves it disabled. The plugin does not add background clipboard polling. |

These notices describe real capabilities, not a finding that every invocation is malicious or that the plugin has been sandboxed. Removing the capabilities would remove supported integrations. Their trust and data boundaries remain described in the [user guide](../user-guide-en.md#data-storage-and-credentials).

## Verification

- Lint, both type checks, the Obsidian API audit and development/production builds passed. The development build was deployed to the isolated QA vault.
- Full coverage suite: **1,261 passed, 0 failed, 2 pre-existing skips**, across 178 passing suites. This is the repository's deterministic/mock suite, with unchanged thresholds.
- A local reproduction of the reported source rules, using the installed Obsidian DOM rule plus the fetch restriction, found **0 errors and the 2 documented fetch warnings**. It is not a fresh run of the external review service.
- **Seven real Node/process checks passed**, without a mock server, transport or response: deadline firing, deadline cancellation, actual child output, child timeout, explicit child cancellation, exclusion of an unlisted parent environment variable, and actual executable lookup.

Run the focused real checks with:

```bash
node tests/real/source-review.mjs
```

They use real local timers/processes, need no API key and make no model-service calls. They do not certify live streaming, popout-window visual behavior, every provider, Ollama or SAP. No new complete real release gate or remote CI pass is claimed for these local source changes. The already published 0.1.0 assets are not replaced.

Local generated evidence:

```text
test-results/obsidian-review-fix-2026-11-05/
```

That directory retains the baseline forbidden-disable findings, local source-rule reports, full coverage output, actual process/timer results and static/build/deployment logs. Generated evidence is ignored by Git and must be shared separately if another reviewer needs it.
