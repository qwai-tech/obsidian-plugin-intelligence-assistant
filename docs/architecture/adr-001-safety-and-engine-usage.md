# ADR-001: Safety model & agent-engine kernel usage

Status: Accepted · Scope: `src/application/agents` (kernel: `src/application/agents/kernel/turn-kernel.ts`), `src/application/tools`

> **Update (2026-10, kernel v2):** the run loop is the **turn kernel**
> (`turn-kernel.ts`). One model turn yields text, reasoning and a batch of tool
> calls; every call in the batch runs before the next turn. Limits live in one
> `Budget` (steps and failures); stops are typed `FinishReason`s, never raw
> strings in the UI. Recovery retries are named `TurnGuard`s (`emptyTurn`,
> `missingProposal`) that emit `guard_triggered`. The kernel reports only through
> `KernelEvent`s; `AgentEngineLoop` maps them to the chat callbacks and appends
> them to a JSONL run journal. `@agentic-kernel/core` is not used.

This record states what is intentional, what was dropped, and what is the actual
safety boundary, so future changes don't "fix" the wrong thing.

## 1. Two safety layers, with different jobs (not redundant)

Vault safety is enforced at the **tool-execution layer**, not the engine policy:

- Tools with `sideEffects.vaultWrite` must return a structured `write_proposal`.
  `ToolRegistry.executeTool` calls `assertWriteProposalResult` and rejects any
  write that is not a proposal (`src/application/tools/tool-registry.ts`).
- The proposal is applied to the vault **only after the user confirms it in the
  UI** (`write-proposal-service.ts` + the chat write-proposal card). The agent
  loop never writes to the vault directly.

The kernel `Budget` is a **separate, orthogonal** layer. It guards the
*control loop* (step budget, failure budget), not file safety. The two protect
different failure modes:

| Layer | Protects against | Mechanism |
|-------|------------------|-----------|
| Write-proposal gate (tool layer) | Accidental / unapproved vault mutation | Proposal + user confirmation |
| `Budget` (kernel) | Runaway loops, repeated tool failure | step limit, failure limit |

Removing either because "the other already covers it" would be a regression.

## 2. Unknown and disabled tools are recoverable

`RegistryToolRunner` runs only the tools resolved for the agent. A call to a known
tool the agent may not use returns `Tool "x" is not enabled for this agent`; a call
to a tool that does not exist returns `Tool "x" does not exist`. Both are failed
results fed back to the model so it can adjust, and both count toward the failure
limit. The kernel never fails a whole run because of a hallucinated tool name.

The real safety boundary for writes is layer 1, above.

## 3. What was dropped with the external kernel

`@agentic-kernel/core` shipped capabilities the host never exercised:
multi-tenancy (`Principal`/`HostContext`), delegation / sub-agents, a
`CapabilityRegistry`, approvals, memory governance, an engine-level context
compactor, parallel tool batches, kernel-side JSON-schema validation, and replay.
These were **dropped deliberately** (2026-10) rather than kept as option value:

- Argument validation already happens in `ToolRegistry.executeTool` (zod).
- Context compaction lives in the context assembler (`HistoryCompactor`).
- Long-term memory lives in `AgentMemoryService`, outside the loop.
- Every kernel event is appended to `<plugin>/data/agent-runs/<runId>.jsonl`, so a
  run remains inspectable after the fact without rewriting a file per event.

Add any of these back to the turn kernel when a feature needs it, not
speculatively.

## 4. DI container

The unused `src/core/container.ts` was deleted in the global refactor (phase 1).
Services are constructed explicitly in one composition root; see the refactor
roadmap, phase 2.

## 5. Consequences

- New write-capable tools MUST go through the proposal gate; do not add a
  direct-write tool path.
- Do not add a policy approval step without the UI to resolve it.
- Keep the kernel small: it owns the loop, not vault safety, memory or context.
