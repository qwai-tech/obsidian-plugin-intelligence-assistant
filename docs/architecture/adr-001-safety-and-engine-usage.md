# ADR-001: Tool execution and the turn-kernel boundary

Status: Accepted; current contract reviewed for 0.1.0 on 2026-11-05.

## Decision

`src/features/agent/kernel/turn-kernel.ts` owns the turn loop through model, context, tool and guard ports. It reports typed events/finish reasons. `AgentEngineLoop` supplies host policy and maps events into callbacks and the JSONL journal. The former external `@agentic-kernel/core` is not a runtime dependency.

Tool execution has distinct checks:

1. Agent/host/task permission intersection limits advertised and dispatched tools.
2. `ToolRegistry` validates actual arguments and uses the binding captured for the task; source reloads cannot silently substitute another implementation.
3. Built-in tools declaring `sideEffects.vaultWrite` must return a supported structured write proposal. This validator does not undo a tool implementation that wrote before returning, so built-in implementations must respect the contract.
4. Normal proposals wait for Apply. [ADR-003](adr-003-autonomous-write.md) permits auto-application when the Agent setting and approved host task both allow it.
5. `Budget` and guards bound execution; they are not filesystem isolation or a substitute for effect authorization.

CLI/MCP/HTTP tools can act directly through their configured process or endpoint. Their effects are outside the built-in vault proposal mechanism. Environment filtering limits inherited variables, not the process's filesystem/network permissions.

## Recoverable and terminal conditions

Unknown/disabled tools, invalid arguments and evidence-contract rejections are reported to the kernel for bounded recovery. They consume the applicable step/failure allowance; the host does not invent a successful tool result. A run can terminate when recovery or failure budgets are exhausted. A transport/output-limit error remains an incomplete/error outcome.

Supported proposal validation currently accepts create, update and append. Internal move/delete type branches do not constitute registered built-in move/delete tools. Applied results differ from pending proposals.

## Consequences

- A new vault-writing built-in must declare effects, validate input and return a proposal without mutating first.
- An external tool must not be advertised as safe merely because it has a proposal-like name.
- Tool batches run in order and are not an atomic transaction or exactly-once guarantee.
- Run ownership/cancellation is in-memory. Journals and checkpoints preserve bounded evidence; they do not automatically replay a crashed run.
- Composition belongs in `main.ts`/`src/bootstrap`; do not reintroduce a speculative dependency-injection container or unused external kernel.

See [architecture](overview-en.md) and [detailed contracts](execution-contracts.md).
