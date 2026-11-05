# Execution contracts — engineering notes

These notes record the production contracts and the investigations behind the current turn kernel. For the runtime map and source ownership, start with [the architecture overview](overview-en.md). Experiment budgets and captured results in these notes are not universal model guarantees.

## Execution contracts hardened on 2026-11-04

Task authorization is an explicit host grant and Agent setting. Prompt text does
not grant autonomous writes. Deep links use the existing launch confirmation;
AI blocks require their existing Run button, including legacy `autorun: true`
blocks. Original user input is kept separate from expanded reference context
for external search. Tool names bind to the task's concrete registry snapshot;
a source refresh invalidates the binding instead of routing by a reused name.

Application-owned runs snapshot configuration and own cancellation, deadlines,
terminal states and shutdown draining. Signals reach model requests, HTTP tools,
CLI process groups, MCP requests, retrieval and memory indexing. Cancellation
cannot undo a side effect that already committed, and the host's buffered
requestUrl transport cannot promise remote cancellation. JSONL journals are
bounded to 100 runs and flushed at terminal boundaries; they are audit records,
not resumable checkpoints.

The final request budget includes serialized history, tool schemas/arguments,
context, image allowances and output reserve. It uses conservative UTF-8 size
estimation, not a model tokenizer; oversized current goals or schemas are
rejected rather than silently made incomplete. Tool history is grouped by call
identity. Memory retrieval and persistence are scoped by Agent and lifetime;
short-term memory stays in the session and long-term memory has a separate
scoped index, embedding identity and entry retention.

Unreadable JSON fails closed and remains on disk. Repositories using JsonFile
serialize writes per adapter/path, retain a backup and use a recoverable temporary
file. Settings serialize loading/saving and restore live values after a failed
commit; their adapter uses host saveData with a prior data.json backup, rather
than promising every host write follows JsonFile temporary-file semantics.
The application still relies on Obsidian's own disk and Sync behavior and does
not claim multi-process locking or transactional crash recovery across Sync.

Shared framing/transport is separate from protocol-specific endpoints and
response decoders. Factory construction and discovery share provider descriptors.
SAP authentication/deployment management is separate from OpenAI, Gemini and
Bedrock protocols. Bedrock uses a real buffered completion rather than treating
AWS binary events as SSE. SAP service compatibility remains unverified until a
real tenant acceptance run is authorized.

ProviderFactory returns a frozen closure facade, and central accounting captures
successful, failed and aborted logical requests across chat, agent work, titles,
grading, embeddings and editor actions. Unknown usage is explicitly tagged;
zero stored tokens for an aborted call do not establish that a service charged
nothing. The facade is API encapsulation, not isolation from other Obsidian
plugins that share the same host. The separate real-release runner tests the
exact built artifact. The CI publisher currently omits that real-verification
job by explicit approval, while retaining build and artifact digest checks;
see the [release status](../releases/0.1.0.md) for the current publication scope.

New Agent conversations snapshot the selected Agent's effective model, sampling
and output budget rather than overwriting them with Chat defaults. Existing
explicit conversation overrides remain unchanged. Output-limit failures consume
trailing usage before rejecting and retain partial text in the existing reply
renderer. When native streaming is unavailable, the host buffers the real SSE
endpoint and validates its events instead of switching to a JSON completion
whose gateway may lose terminal metadata. No output-budget increase, automatic
continuation or thinking-mode change is implicit.

Long-run context retains a bounded ledger of omitted tool results and factual
records from saved conversation traces. These records do not create executable
calls, restore stale tool bindings, or grant permissions. Application-generated
execution summaries are tagged as expendable context, not synthesized assistant
turns. Immutable policy messages stay protected; old tagged context may be
removed to keep the whole request within budget. The current native tool batch
keeps its call identities, and small results retain exact checkpoint metadata
before older context is retired.

The user task is saved before model dispatch, so a reload during a long run does
not erase its request. Stop records survive reload and an explicit continuation
can use saved execution evidence. Agent conversation messages also persist a
bounded logical task checkpoint: the original user goal, explicit tool
restrictions, unique successful calls with visit counts, the latest new read,
the latest observed read, and pending or uncertain calls. Re-reading an earlier
source for verification does not move the latest new read backward. A bare
`Continue.` or `Resume.` reconstructs the task before the rolling context window
is applied; older saved execution traces can be migrated into the same factual
record. A distinct user task starts a fresh checkpoint. This is context recovery,
not automatic tool replay or proof of semantic completion. The run coordinator
is still in-memory, and the journal does not automatically replay a crashed run.
Exactly-once effects and idempotency remain properties of actual tools/artifacts;
a pending external call can have an uncertain outcome and must be inspected
before retry.

Explicit top-level directives such as `Use only read_file;` and
`Only use the read_file tool.` narrow both model tool schemas and dispatch-time
permissions, including after a bare continuation. They intersect configured
Agent permissions and any host allowlist; they never grant a capability.
`No tools.` denies all tools. Quoted examples, blockquotes and fenced code are
not directives. Recognized restrictive directives with unsupported syntax fail
closed. This intentionally limited grammar is not general natural-language
policy interpretation; use exact tool names for task restrictions. Persisted
checkpoint metadata is removed from provider messages and supplied as bounded
application context instead.

Live execution facts are appended after all preceding tool results in each model
request. This placement matters: a current cumulative snapshot before recent
results can be misread as an earlier boundary to which those results must be
added again. Per-run counters include the current run ID; saved task checkpoints
also retain the most recent finished run's ID, outcome and successful-call counts.
A new continuation resets current-run counts to zero without invalidating the
previous run's receipt. Legacy runs recover a receipt from saved successful
action records when available.

Before a tool-free answer is accepted, an execution-count guard compares the
canonical JSON `thisRunReads` field and recognized explicit English current-run
read claims with actual successful `read_file` events. Explicit `previousRun`
JSON is checked against that separate receipt. A recognized false withdrawal of
a recorded earlier count is also rejected. The guard requests a fresh concise
report, omits the rejected candidate to reduce anchoring, grants no new tool
access and accepts no inconsistent completed answer after two failed corrections.
It does not reinterpret domain totals, rewrite numeric values silently, or prove
every arbitrary natural-language quantity. Per-file repeat counts exclude the
first successful read; changed or omitted evidence still requires inspection.

If an already executed call has argument metadata too large to fit at all, the
whole historical batch becomes bounded factual context with its recorded result.
Arguments are never altered to create misleading executable tool history. This
fallback is separate from shortening a large result while retaining native IDs.

Free Agent completion now has an explicit internal status protocol and a bounded
reconsideration step. A progress-only or unmarked response does not directly
close the task. Complete answers receive a review; blocked/needs-input answers
remain possible. Two attempts without tool progress fail explicitly as incomplete.
The guard does not force a tool choice, alter reasoning mode, or expand existing
authorization. It is model self-review, not a universal semantic proof of task
completion. Independent acceptance checks inspect actual task artifacts.

Guard corrections are application context, never replacement user goals. An
unconfirmed response is explicitly quoted as candidate data rather than replayed
as a native assistant turn with missing reasoning metadata. Only the latest
correction is non-expendable; earlier corrections can retire. Internal status
comments remain available to the state machine but are omitted from live reply
text and final rendered answers. No renderer layout/control changes are needed.

Each kernel run has a stable runtime identity and a bounded, non-expendable
first-observation anchor. Later status results cannot overwrite the first facts.
Saved conversation evidence separately preserves its originating task excerpt,
source timestamp, successful/pending action counts and last successful action.
Rolling records label prior_history versus current_run. These are factual data,
not instructions, permission grants, approval evidence or executable old bindings.
A successful tool return still does not prove a write proposal was approved.

Streaming resilience distinguishes waiting for response headers, inactivity after
headers, and the stream's absolute lifetime. Without explicit overrides, headers
and each non-empty-byte gap are bounded by five minutes; an active stream may
continue for up to fifteen minutes. Explicit request/options timeoutMs keeps its
absolute-deadline meaning. Buffered requests, which cannot observe intermediate
progress, retain the five-minute total limit. Byte progress (including SSE
heartbeats) resets only the inactivity timer, never the hard cap. Timeout errors
include the phase, elapsed time and byte count; model POSTs are not automatically
retried. These limits cannot repair an upstream stall or guarantee service latency.

Completion reconsideration audits numeric scope in structured data and prose.
A total returned by a call targeting one object is not independently established
as cumulative merely because an earlier assistant called it that. Unverified
intermediate aggregates must be omitted or labelled as the exact call's returned
field; aggregate evidence is required for task-wide claims. Bounded candidate
excerpts retain both the opening and ending so an erroneous closing explanation
is available to review; omitted middle content is explicitly marked unreviewed.
This remains model self-review, not a deterministic proof of arbitrary prose.

A progress/liveness correction does not satisfy the final-answer review. Exact
derived figures require actual permitted computation output. An assistant-written
equation is not itself verification; unavailable exact quantities must be reported
as missing verification rather than silently guessed. This policy does not add a
calculator or new permissions to the plugin and cannot guarantee model compliance.

Action reliability: progress corrections are concise execution checks. They do not
quote the progress-only acknowledgement back to the model, and explicitly mark
any initial acknowledgement request as satisfied. The latest correction is
removed once tool use resumes, preventing that resolved prompt from persisting
as protected context. Final factual review remains separate. No tool is forced;
blocked/input-needed and plan-only replies remain valid, and no-progress retries
remain bounded at two.

Trusted ToolDefinition/CLI configuration may declare argumentSources: a target
argument, conditional operation, successful source tool/operation, matching
source/target argument names, and an output property path. RegistryToolRunner
checks actual per-run receipts before dispatch. A matching observed scalar must
be copied exactly; a wrong value, missing read, or other target is rejected before
external execution. The default consumes a receipt at dispatch, even on uncertain
failure. Failed source refreshes invalidate old receipts; new runs start empty.
Only own structured-output properties are read, including JSON-encoded CLI data.
The receipt store is bounded and a small exact-value context survives model
history clipping. Receipts do not grant permissions or prove a write was approved.

This is a declared contract, not a universal semantic parser. Unconfigured tools
retain existing argument/schema behavior, including legitimately creating new
identifiers. Native built-in file tools, arbitrary CLI commands and MCP/OpenAPI
adapters do not acquire read-before-use semantics automatically. Source authors
must supply accurate trusted contracts; tool implementations still validate live
state. The CLI configuration round-trips without adding or changing UI controls.

Source readiness includes an explicit zero count, so absence of a receipt does
not look like an omitted status. A source-rejected proposal is journalled as
non-dispatched, costs a step, and has a separate two-consecutive-rejection bound
without successful tool progress. It is not charged as an externally executed
tool failure; the three real-failure cap remains. This can repair isolated
missing-read proposals throughout a long task without silently increasing any
failure cap or dispatching an invalid call. Final-review candidate data is tagged
expendable separately from protected review instructions, retaining whole-request
budget enforcement when the candidate is long.
