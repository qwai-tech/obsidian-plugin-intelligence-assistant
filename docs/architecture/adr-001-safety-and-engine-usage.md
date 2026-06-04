# ADR-001: Safety model & vendored agent-engine-core usage

Status: Accepted · Scope: `src/vendor/agent-engine-core`, `src/application/agents`, `src/application/tools`

This record exists to remove a recurring ambiguity: a large, generic agent
kernel is wired in, but the host (a single-user, local Obsidian plugin) only
uses a fraction of it. Without this note, that gap reads as a defect. It is a
deliberate trade-off. The points below state what is intentional, what is
reserved, and what is the actual safety boundary — so future changes don't
"fix" the wrong thing.

## 1. Two safety layers, with different jobs (not redundant)

Vault safety is enforced at the **tool-execution layer**, not the engine policy:

- Tools with `sideEffects.vaultWrite` must return a structured `write_proposal`.
  `ToolRegistry.executeTool` calls `assertWriteProposalResult` and rejects any
  write that is not a proposal (`src/application/tools/tool-registry.ts`).
- The proposal is applied to the vault **only after the user confirms it in the
  UI** (`write-proposal-service.ts` + the chat write-proposal card). The agent
  loop never writes to the vault directly.

The engine `PolicyManager` is a **separate, orthogonal** layer. It guards the
*control loop* (step budget, failure budget, allowed-tool set), not file safety.
The two protect different failure modes:

| Layer | Protects against | Mechanism |
|-------|------------------|-----------|
| Write-proposal gate (tool layer) | Accidental / unapproved vault mutation | Proposal + user confirmation |
| Policy (`BasicPolicy`) | Runaway loops, tool-name hallucination | `maxSteps`, `maxFailures`, `allowedTools` |

Removing either because "the other already covers it" would be a regression.

## 2. Why the engine policy is intentionally permissive

`AgentEngineLoop` configures `BasicPolicy` with `allowedTools` = **all known
tools** and **no** `requireApprovalForTools`
(`src/application/agents/agent-engine-loop.ts`). This is deliberate:

- **Single principal, single tenant.** `host` is hardcoded `tenantId: 'local'`,
  one `local-user`, `effectiveScopes: []`. There is no multi-tenant access
  surface to gate.
- **`require_approval` would break turns.** No `ApprovalProvider` is wired and
  there is no approval-resolution UI. If the policy returned `require_approval`,
  `engine.run()` would return `waiting_for_approval` and the turn would end
  without executing the tool or surfacing a prompt. Until an approval UI exists,
  approval must stay off.
- **"Allow all known tools" is the better failure mode, on purpose.** If the
  model calls a tool the agent does not have, the kernel tool adapter returns a
  *recoverable* "Tool not enabled" error (the model can adjust). If instead the
  policy *denied* it, `engine.#failState` would kill the whole turn. Allowing at
  the policy layer and rejecting at the adapter layer is the intended design —
  do not "tighten" `allowedTools` to the resolved set.

The real safety boundary for writes is layer 1, above. The policy's live job is
purely the step/failure budget.

## 3. What is reserved (kept, not dead)

The kernel ships capabilities the host does not currently exercise:
multi-tenancy (`Principal`/`HostContext`), delegation / sub-agents,
`CapabilityRegistry`, `ApprovalProvider/Store`, `MemoryManager` governance,
`ContextCompactor`, and full replay. These are **retained as option value**:
they sit behind stable contracts and can be enabled by passing an option to
`createAgentEngine`, not by re-architecting. They are not to be deleted as
"unused" without a decision to drop the capability itself.

When enabling one of these, the work is: (a) provide the dependency to
`createAgentEngine`, and (b) for `approval`, also build the resolution UI (see
§2). Context compaction is currently done at the planner level
(`HistoryCompactor`), not via the engine `compactor` — pick one if both are ever
wired.

## 4. DI container

`src/core/container.ts` is a working IoC container with its own tests but is not
used by production wiring (services are constructed explicitly in `main.ts` /
`ChatView`). It is **kept** as tested option-value infrastructure. It is not a
signal that services *should* be resolved through it today; explicit
construction remains the convention.

## 5. Consequences

- New write-capable tools MUST go through the proposal gate; do not add a
  direct-write tool path.
- Do not enable `require_approval` in policy until an approval UI exists.
- Do not delete reserved kernel capabilities as "dead code"; deletion requires
  dropping the capability deliberately.
