# Report: Agent-Centric Verification System + Real-Obsidian Stress Test

**Date:** 2026-06-14

## 0. Summary

Two bodies of work:
1. **Deterministic verification system (Plans 1–5)** — implemented, merged to `main`, pushed, and verified green by real GitHub CI.
2. **Real-Obsidian (L3/L5) testing** — diagnosed two environment-side blockers, ran medium tasks reliably, and (via systematic debugging + model guidance) ran a **single continuous agentic task for 24.6 minutes** in real Obsidian.

---

## 1. Deterministic verification system (Plans 1–5, merged)

Organizing principle: **Agent Mission / Golden Trajectory**. Gating lives on deterministic layers so "green = shippable" holds.

| Plan | Delivered | Key result |
|---|---|---|
| P1 Mission harness | headless real `AgentEngineLoop` + real tools + in-memory vault + in-process mock LLM; tool-log & real-vault-side-effect oracles | resolved real seams (provider uses `fetch`; autonomous-apply path) |
| P2 Mission library | 8 reliability missions (large multi-step, permission isolation, max-steps, error recovery, stop, RAG, non-builtin tool source) + coverage manifest | every mission mutation-verified to "bite" |
| P3 Meta-verification | flake-soak + Stryker mutation | flake-soak **20/20 identical**; mutation **42.39% → 94.57%** (break=90) |
| P4 Performance | deterministic agent-efficiency gate + memory-leak guard + non-blocking timing | memory ratio **1.01**; noisy metrics never gate |
| P5 CI gate | `verification-gate.yml` (build→lint→test→flake-soak→memory→mutation) + static-check coverage | static-check surfaced & fixed a real masked type error |

**Real GitHub CI (push-triggered):** Verification Gate = **success** — 577 tests, flake-soak 20/20, memory 1.01, mutation 94.57% ≥ 90.

The four axioms are mechanized: Accurate (coverage manifest + real side-effect oracles), Effective (94.57% mutation gate per PR), Reliable (flake-soak), Verifiable (auditable gate artifacts).

---

## 2. Real-Obsidian testing (L3/L5)

### 2.1 Real Obsidian works
Smoke 3/3 in 8s.

### 2.2 Gateway diagnosis (environment-side, two blockers)
Local `mf_session` gateway (127.0.0.1:17680):
- **No CORS** → Obsidian renderer streaming `fetch` is origin-blocked (curl isn't). Worked around with a local CORS proxy.
- **Does not pass through `tool_calls`** — definitive: deepseek-v4-pro's `reasoning_content` said "I need to use the write_file tool" yet the response had empty `content` and no `tool_calls`. Verified across 5 models × OpenAI/Anthropic protocols and dedicated endpoints — the gateway is chat-only. The plugin correctly sent the tools.

### 2.3 Medium task on real DeepSeek API — 5/5
Real `api.deepseek.com` (native tool calling + `ACAO: app://obsidian.md`, no proxy needed). "Autonomously create 4 linked notes" passed **5/5**, ~7–8s each, 4 real `create_note` calls, autonomous-apply, real vault writes verified.

### 2.4 Single long task > 20 min — root-cause journey → success

| Step | Observation | Conclusion |
|---|---|---|
| 60-note / 12×3000-word | ~30s bail, 0 notes | **(wrong inference)** "agent gives up on big tasks" |
| controlled N=2 short | 2/2 pass | spec is fine |
| bisect: N=30 short vs N=2×3000 | 30 short pass; 2×3000 bail | trigger is **content length**, not count/steps |
| code trace | `createAgentConfig` default `maxTokens:1000` → `chat-view:1218` → `conversation-manager:311` → request | **ROOT CAUSE: output capped ~750 words; long content in a tool-call argument truncates → malformed JSON → tool call dropped → empty bail** |
| fix: maxTokens=8000, N=2×3000 | 2/2, each ≥4000 chars | root cause + fix confirmed |
| N=40×3000 | 2/40 then bail | **(wrong inference)** "wall after 2 notes" |
| N=6×3000 | 6/6 in 5 min | no such wall; N=40 bail was the deprecated weak `deepseek-chat`(=`v4-flash`) alias |
| **`deepseek-v4-pro`, N=24×3000, maxTokens=8000** | **24/24, all ≥4000 chars, index, 24.6 min, PASS** | **goal achieved** |

**Final:** `1 passing (24m 35.9s)`, `notes=24/24 substantial(≥4000c)=24 index=true`, one unbroken agent session (~70s/note, no bail), verified by the real vault side-effect oracle. Real Electron + real DeepSeek (`deepseek-v4-pro`) + real agent loop + real autonomous writes, **>20 minutes continuous**.

Two fixes made it work — both found by re-testing, not by inference:
1. **`maxTokens` 1000 → 8000** (root-caused by data-flow tracing).
2. **`deepseek-chat` → `deepseek-v4-pro`** (`deepseek-chat` is a deprecated alias for the weaker `v4-flash`).

---

## 3. Findings that need fixing

**Product (evidence-backed):**
1. **Silent drop of truncated tool calls (P0).** When a tool-call argument is truncated by the output-token cap, the malformed `tool_calls` is silently dropped and the turn ends empty — the agent reports nothing wrong and writes nothing. Should detect an incomplete/`finish_reason:length` tool call and continue/retry or surface it. Also: the agent's `maxTokens` should scale with the model's output capacity / be easily configurable ("refresh model").
2. **Empty-content turn treated as completion.** A turn with no content and no tool call ends the loop as if "done"; for an unfinished task this is indistinguishable from success in the UI.

**Config:**
3. Default/release model is the deprecated `deepseek-chat` alias; move to `deepseek-v4-pro`. Default agent `maxTokens` (2000–4000 in presets) truncates long-form single-tool-call writes.

**Test infra (carried forward from Plans 1–5):**
4. Pin `OBSIDIAN_VERSION` in `e2e.yml` (currently `latest`, non-deterministic).
5. jest `projects` split to drop global `maxWorkers:1`.
6. Widen the mutation `mutate` glob beyond the single orchestration file.
7. Thin the 28 WDIO specs to a small critical-path set (per spec §4).

---

## 4. Methodology note (honest)

The long-task diagnosis over-generalized from single failures **twice** ("agent gives up on big tasks"; "wall after 2 notes") — both wrong. Each was corrected by a controlled, one-variable experiment and by model/config guidance. Systematic debugging (root cause before fixes) was skipped initially and added mid-way; it then located the root cause quickly. Evidence-handling lesson: a `git checkout` for key hygiene once wiped a run's persisted execution log before it was read — read evidence before cleaning up.

API key hygiene: the test seed (`seedReleaseProvider`) writes the provider config + key into a tracked vault file at runtime; it was reverted after every run and **no key reached git**.

---

## 5. Artifacts (this report's branch)

- `tests/e2e/specs/release/large-task.spec.ts` — medium multi-step L5 (5/5), real vault side-effect oracle.
- `tests/e2e/specs/release/long-task.spec.ts` — single long-task endurance L5 (24.6 min run), opt-in via `RUN_LONG_TASK=1`.
- `tests/e2e/config/wdio.long.conf.ts` — endurance config (no retries, 30-min timeout).

All use env vars only (no keys) and skip without release LLM env. Run via, e.g.:
`RUN_LONG_TASK=1 E2E_TEST_PROVIDER=deepseek E2E_TEST_MODEL=deepseek-v4-pro E2E_TEST_API_KEY=... LONG_TASK_MAXTOKENS=8000 LONG_TASK_NOTES=24 LONG_TASK_WORDS=3000 npx wdio run tests/e2e/config/wdio.long.conf.ts`
