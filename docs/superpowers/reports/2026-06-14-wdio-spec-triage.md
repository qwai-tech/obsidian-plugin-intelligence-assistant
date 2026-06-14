# WDIO (L3) Spec Triage — Decision: keep coverage, do not thin

**Date:** 2026-06-14
**Re:** fix-list item #8 ("thin the 28 WDIO specs to 5–8 critical paths")

## Decision

**Do NOT thin/delete the WDIO specs.** After triage, the original recommendation
is **withdrawn** — it rested on a false premise.

## Why the "thin it" premise fails

The recommendation assumed the deterministic **L2 mission harness** now covers the
functionality, so **L3 (real-Obsidian WDIO)** can shrink to a handful of smoke
paths. But **L2 runs against a *mock* Obsidian** (`tests/harness/in-memory-vault.ts`
+ the obsidian jest mock). It verifies *orchestration logic*, not the **real
Obsidian rendering / workspace / settings UI / editor integration**. So L2 cannot
replace L3 — they verify different things. Deleting L3 specs would lose genuine
real-Obsidian coverage that nothing else provides.

## Inventory (30 specs)

| Category | # | L2 equivalent? | Verdict |
|---|---|---|---|
| `00-smoke` | 1 | n/a | **Keep** — the critical load/render gate |
| `settings` | 10 | **none** (UI CRUD has no L2) | **Keep** — L3-only |
| `chat` | 7 | partial (PM1/PM2 + chat-service units) | **Keep** — L3 verifies real rendering/persistence |
| `agents` | 4 | partial (M5/M6/M7/M8) | **Keep** — L3 verifies real agent UI/trace |
| `rag` | 2 | partial (M2) | **Keep** — L3 verifies real indexing path |
| `editor` | 1 | **none** | **Keep** — L3-only (editor quick actions) |
| `release` | 5 | n/a (real LLM) | **Keep** — non-blocking L5 |

Net: only the chat/agents/rag specs (13) have *partial* L2 overlap, and even those
exercise the real Obsidian DOM/workspace that the mock cannot. No spec is safely
redundant.

## If CI speed/cost is the real concern (non-destructive option)

Keep all specs but split execution — **without deleting anything**:
- **PR gate:** run a thin critical subset (e.g. `00-smoke` + one chat round-trip
  + one agent tool-loop) for fast feedback.
- **Nightly / push-to-main:** run the full L3 suite.

This preserves coverage and speeds up PR feedback. It is left unimplemented here
deliberately: the existing `e2e.yml` passes today, and restructuring a green CI
pipeline is the maintainer's call — not something to change autonomously. The
deterministic verification gate (`verification-gate.yml`) already gives fast,
flake-free PR feedback on the L1/L2/perf/mutation layers.

## Outcome

#8 is resolved as a **documented decision to retain L3 coverage**, with a concrete
opt-in speed split available when wanted. No specs deleted.
