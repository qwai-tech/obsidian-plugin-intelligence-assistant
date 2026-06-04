# ADR-003: Autonomous write (escape hatch from the proposal gate)

Status: Accepted · Scope: `src/application/agents`, `agent-edit-modal`, Agent type

## Problem

ADR-001 made the write-proposal gate the safety model: every vault write returns
an Apply-gated proposal. That assumed the user always wants to confirm. A user
explicitly asked "制定方案，拆成多个文件放入 notes，不需要我确认，你自主完成"
— and the product could not honor it: every file was a proposal needing a manual
Apply, so "autonomous completion" was architecturally impossible. The safety
default had hardened into an unconditional rule with no escape hatch.

## Decision

Add an explicit, opt-in autonomous-write path. When granted, write proposals are
applied to the vault at tool-execution time instead of producing Apply cards.

Two ways to grant it (either enables a run):
1. **Per-agent toggle** `Agent.autonomousWrite` (deterministic; in the agent
   edit modal next to RAG / Web toggles). Default false.
2. **Per-task intent** — the user's message explicitly authorises it (e.g.
   "自主完成 / 不需要确认 / autonomously / without confirmation"), detected by a
   small multilingual matcher. Convenience layer; the toggle is the robust path.

`AgentEngineLoop` computes `autoApplyWrites = agent.autonomousWrite || intent`,
and threads it (plus the App) into the kernel tool adapter. When set, after a
write tool returns a proposal the adapter applies it via `applyWriteProposal` and
returns an "applied" result so the model knows the write landed and can build on
it (e.g. interlink notes).

## Safety floor (non-negotiable even under autonomy)

- **Delete is never auto-applied** — destructive ops always fall back to a manual
  proposal, regardless of grant.
- **Apply failure falls back to a proposal** — if the write throws (e.g. file
  exists), the user still gets a reviewable card; nothing is silently lost.
- Tool access is unchanged — the agent can only write through tools its
  `toolAccess` already enables.
- Default remains proposal-gated; autonomy is strictly opt-in.

## Why apply at tool-execution time (not auto-click at the UI)

Applying during the run (vs auto-clicking Apply on rendered cards) means: the
file exists immediately so later steps can reference it; re-rendering a loaded
conversation never re-applies (no duplicate writes); and there are no half-applied
card states to manage. The proposal mechanism is bypassed only when authorised.

## Related fix

The agent edit modal's maxSteps slider was capped at 20 — below the new default
(25) and ceiling (50, ADR-002). Raised to 50 so users can actually budget large
autonomous tasks. (No stateful migration of existing agents' maxSteps; the slider
is editable, and ADR-002's estimate path adapts per task.)
