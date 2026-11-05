# ADR-003: Explicit automatic application of vault proposals

Status: Accepted; current authorization contract reviewed for 0.1.0 on 2026-11-05. The older prompt-intent matcher described by this record is no longer an authorization path.

## Decision

Built-in vault tools prepare write proposals. Automatic application requires both:

1. The selected Agent has `autonomousWrite === true`.
2. The task has host approval (`authorization.approved === true`). Sending a chat task, approving the launcher or clicking an inline AI block's Run button supplies the appropriate host action.

`resolveExecutionPolicy` snapshots this conjunction. Wording such as “autonomously” or “without confirmation”, quoted note contents and a deep-link payload do not independently grant it. Unapproved task entry points cannot use the setting to bypass host authorization.

`RegistryToolRunner` applies supported proposals through `applyWriteProposal` during execution and returns an actual applied result. This lets later tools inspect/reference saved files. When automatic application fails, the existing proposal remains available for manual review. Normal non-autonomous runs leave Apply-gated cards.

## Boundaries

- Tool permissions still apply; automatic writes do not enable disabled tools.
- Current supported validated proposals are create, update and append. There is no registered built-in move/delete tool; do not infer one from legacy type branches.
- External CLI/MCP/HTTP tools may make effects directly. They are not covered by the built-in vault gate or isolated by this switch.
- Updates compare expected previous content where supplied, so stale proposals can fail instead of overwriting changed content.
- A batch is sequential, not an atomic rollback transaction. Cancellation or a failure after earlier effects does not undo them.
- Loading/rendering an already applied conversation does not itself apply the proposal again. This does not establish exactly-once behavior for arbitrary external operations.

See [ADR-001](adr-001-safety-and-engine-usage.md), [architecture](overview-en.md) and the [user guide](../user-guide-en.md#agents-and-writes).
