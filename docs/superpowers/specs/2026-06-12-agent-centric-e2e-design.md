# Agent-Centric Automated Verification Design

**Date:** 2026-06-12
**Status:** Approved (design phase)
**Goal:** A fully automated verification system that objectively proves *functional
completeness, reliability, and performance* of the plugin's autonomous agent, so that a
green pipeline — not a human's judgment — is the basis for release.

---

## 1. North Star

> Reliable release means: the decision to ship is made by an automated system that has
> *proven* the agent works — not by "I wrote the code and it looks fine."

The product is a **Full autonomous Agentic workspace**. Therefore the *subject* of
verification is the **Agent**, not chat/settings/RAG/MCP as co-equal features. Those are
the supporting cast: they exist to let the agent complete tasks. The whole strategy is
organized around the agent.

The four non-negotiable quality properties (the "quality axioms"):

| Property | Engineering meaning |
|----------|---------------------|
| **Accurate** | Green = genuinely correct. No false greens. |
| **Effective** | Tests have teeth — they actually catch real bugs. A test that cannot fail when the code breaks is worthless. |
| **Reliable** | No flakes. No false reds, no false greens. Deterministic. |
| **Verifiable** | All of the above are measurable, auditable, and reproducible. |

A non-goal worth stating: **"absolute" applies only to deterministic verification of the
orchestration logic.** Whether the agent solves novel real-world tasks with a *real* model
is inherently probabilistic and is handled as a statistical, non-blocking signal — never
conflated with the deterministic gate.

---

## 2. The Core Unit: Agent Mission

The unit of testing is **not** an isolated feature point — it is an **Agent Mission**: a
realistic, multi-step task the agent must complete. Each feature (RAG, MCP, a tool source,
permission isolation) is verified *as a capability exercised inside a mission*, never in
isolation. This structurally guarantees the strategy stays "around the agent."

### Golden Trajectory — making agentic behavior deterministically gateable

A real LLM is non-deterministic and cannot be a gate. So every mission carries a
**scripted trajectory**. The system under test (SUT) is **the agent orchestration code you
wrote**, not the LLM's intelligence.

```
Mission {
  allowedTools: [...]                     // permission boundary
  scriptedTurns: [                        // mock LLM returns these in order / by state
    → tool_call(read_file,   {...}),
    → tool_call(vault_search,{...}),
    → tool_call(write_file,  {...}),
    → final("done")
  ],
  toolBehaviors: { vault_search: (args) => fixed result },
  expect: {
    toolCallSequence: [...],              // correct order + arguments
    filesWritten:     [...],              // correct final vault state
    steps:            ≤ N,                // no needless detours
  },
  budget: { steps, tokens, wallMs, heapGrowth }   // efficiency thresholds
}
```

A single mission definition yields three classes of assertion:

- **Functional correctness** — tool-call sequence correct, final artifacts correct → *completeness*
- **Efficiency** — steps / tokens / wall-time / memory within budget → *performance*
- **Reliability** — derived **failure-injection variants** (a tool throws mid-trajectory,
  the stream is interrupted, max-steps is hit, context is over-long and truncated, an
  out-of-allowlist tool is requested) assert the agent recovers/reports gracefully, does
  not crash, and does not exceed its permissions → *reliability*

### Defusing the "self-proving" risk (oracle problem)

A scripted trajectory invites a fatal objection: *if I script the LLM AND assert the
outcome, am I just checking that the mock equals my assertion?* Resolved by strictly
separating SUT from oracle:

- **The only mocked boundary is the LLM's token output.** Everything else is real code:
  the real agent orchestration loop, real `write_file` / `vault_search` tool
  implementations, real persistence, an in-memory **real** vault adapter.
- **The oracle is real side effects, not mock internals**: assertions read the *actual file
  content the real tool wrote into the vault*, the *actual persisted conversation format on
  disk*, the *tool-call log captured at the real tool-dispatch boundary* — never "what the
  mock received."
- Thus the trajectory only decides *which tokens are fed*; what is verified is the *real
  consequences your orchestration produces on real tools/storage*. Circularity removed.

---

## 3. Proving the Tests Themselves Are Trustworthy

This is the layer that distinguishes "many passing tests" from "verification you can trust."

| Axiom | Mechanism | How it is **proven** |
|-------|-----------|----------------------|
| **Accurate** | SUT/oracle separation; assertions on real side effects; coverage manifest forces every agent capability to have a mission | An untested capability cannot "accidentally" be green |
| **Effective** | **Mutation testing** (Stryker): deliberately break the orchestration (flip the max-steps check, drop a tool result, skip permission validation, omit a step) — the suite **must go red**. A surviving mutant = an ineffective test → add coverage | **Mutation score is a gate threshold (≥ 85%)** — the only provable definition of "effective" |
| **Reliable** | Determinism in the gating layers; **flake-soak**: run the deterministic mission suite **50×** in CI, require 50/50 identical results; any wobble = red + quarantine. Real Electron/API jitter (L3/L5) is **never** in the blocking gate | Reproducibility via fixed seed, pinned Obsidian version, fixed mission definitions |
| **Verifiable** | The gate is a machine-readable contract emitting artifacts every run: coverage-manifest report + mutation score + flake-soak result + perf baseline diff | Any single artifact below threshold → red |

**Mutation scope (to keep "every PR" feasible):** mutate only the **agent orchestration
core** — `src/application/agents/**` plus tool dispatch and persistence serialization —
not the whole codebase. These are the mission SUT; the blast radius is concentrated and
fast. Supporting code relies on L1/L2 coverage instead.

---

## 4. Layered Architecture

The gate lives on the deterministic layers; real-Obsidian only provides critical-path
endorsement. "Green = shippable" only holds when "green" cannot intermittently fail.

| Layer | Runs on | Verifies | Blocks release? |
|-------|---------|----------|-----------------|
| **L1 Unit / contract** | jest (existing 39 files) | Pure logic: settings migration, config, tool schema, error classification | ✅ |
| **L2 Mission harness (core)** | jest + jsdom + thickened Obsidian fake + in-process mock LLM | Scripted missions: nearly all agent functionality + reliability + efficiency | ✅ |
| **L3 Thin real-Obsidian E2E** | WDIO (pinned version, 5–8 specs) | "It really runs inside real Obsidian": load, one chat round-trip, persistence across reload, one agent tool-loop | ✅ (version matrix at tag) |
| **L4 Performance suite** | mostly node / headless, deterministic | Startup/load time, plugin-side latency, RAG throughput, memory-leak slope, **agent large-task efficiency** | ✅ (vs baseline) |
| **L5 Real-LLM smoke** | WDIO + real API | External API drift; statistical proof the prompts steer a real model | ❌ **non-blocking**, nightly report |

### Why L3 stays thin and pinned

`OBSIDIAN_VERSION: latest` is a non-deterministic input — a new Obsidian release can break
the plugin or the wdio service at any time (cf. the `1.13.0` adoption rollback). L3 pins
versions and keeps only a handful of critical paths; the rest of the intent is pushed down
to the deterministic L2.

### L2 technical stack (reuse existing assets, do not rebuild)

- jest + jsdom (existing) + a **thickened `__mocks__/obsidian.ts`** (fill in in-memory
  Vault / Workspace / adapter implementations)
- in-process version of the existing `mock-llm-server`, reworked to return scripted turns
  in order / by state
- real tool implementations + real persistence + in-memory vault adapter = oracle reads
  real side effects

---

## 5. Performance & Efficiency (L4)

Dimensions to measure, each with a committed baseline and a regression gate:

1. **Startup / load time** — plugin `onload` → usable; first chat-view render; settings-tab open.
2. **Plugin-side response latency** — with mock LLM, the plugin's own overhead: first token, streaming render frame rate, per-step time in the tool-call loop (real network excluded).
3. **RAG / indexing throughput** — large-vault indexing time (ms/note + total), retrieval latency, behavior as the vector store grows.
4. **Memory / resource leaks** — heap-growth slope across repeated operations (long conversation, repeatedly open/close view, multi-round agent). Leak = slope above threshold.
5. **Agent large-task efficiency** — reuse mission budgets (steps / tokens / wall-time) as regression gates; flagship mission **M4** (batch-rewrite, 10+ steps) is the headline efficiency & reliability scenario.

Baselines are committed as JSON. Gate = within X% of baseline **and** under an absolute
ceiling. Results are reproducible (fixed seed, fixed Obsidian version, fixed missions).

---

## 6. Mission Library v1

Each mission = golden trajectory + budget + failure variants.

| # | Mission | Agent capability exercised |
|---|---------|----------------------------|
| M1 | Read note → write summary | builtin read/write + single-step baseline |
| M2 | RAG retrieve → synthesize → save | RAG injection + multi-step |
| M3 | Call MCP tool → use result | MCP discovery / invocation |
| **M4** | **Batch-rewrite 3 notes (10+ steps)** | **large-task reliability & efficiency flagship** |
| M5 | Request a tool outside the allowlist | permission isolation |
| M6 | Trajectory exceeds max-steps | budget halt |
| M7 | Tool throws mid-trajectory | error recovery / reporting |
| M8 | Stop mid-task | clean cancellation, consistent state |
| M9 | Long task persist → reload → resume | persistence / resume |
| M10 | OpenAPI / CLI tool source, one each | tool-source coverage |

A **coverage manifest** (`tests/missions/coverage-manifest.ts`) maps every agent capability
to at least one mission. A meta-test asserts the mapping is total: **shipping a new
capability without a mission turns CI red.**

---

## 7. Release Contract (the no-human mechanism)

- **PR / push — blocking job:**
  L1 jest → L2 mission harness → **flake-soak (mission suite ×50, all identical)** →
  **Stryker mutation (agent core, score ≥ threshold)** → L4 perf vs baseline →
  coverage-manifest check → L3 smoke (single pinned version). All green ⇒ mergeable.
- **Tag — job:** all of the above + L3 **version matrix** (`minAppVersion 1.8.7` ⨯
  latest-good) ⇒ **auto-publish**.
- **Nightly — job:** L5 real-LLM scores the missions (completion rate / step distribution /
  cost trend), **non-blocking**, regression alert only.

---

## 8. Directory Structure

```
tests/
├── missions/
│   ├── coverage-manifest.ts      # capability ↔ mission map (meta-tested for totality)
│   ├── M1-read-write.mission.ts  # definition + golden trajectory + budget + failure variants
│   ├── M2-rag-synthesize.mission.ts
│   └── ...                        # M3–M10
├── harness/                       # L2 engine: thickened Obsidian fake, in-process mock LLM,
│   │                              #   mission runner, real-side-effect oracle helpers
│   └── ...
└── perf/                          # L4: baselines (JSON), runners, regression gate
```

(Existing `tests/e2e/**` is retained for the thinned L3 suite and the L5 release suite.)

---

## 9. Tooling

- **Mutation:** Stryker Mutator (native TypeScript support), scoped to the agent core.
- **L1 / L2:** jest (existing).
- **L3 / L5:** WDIO + wdio-obsidian-service (existing), pinned versions.
- **L4:** node-based perf runners with committed JSON baselines.

---

## 10. Open Thresholds (to confirm during planning)

- Mutation score gate: starting target **≥ 85%** on the agent core.
- Flake-soak repetitions: starting at **50×**.
- Perf regression tolerance: **±X%** vs baseline + absolute ceilings (per dimension, TBD
  from first measured baselines).
