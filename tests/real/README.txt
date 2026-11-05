Real-service UX regressions

Required environment: IA_REAL_API_KEY (a valid Manifold key).
Optional: IA_REAL_BASE_URL (default http://127.0.0.1:17680/v1),
IA_REAL_MODEL (default deepseek/deepseek-flash), IA_REAL_RESULTS (output folder).

Run: npm run test:real:ux

The command builds the actual provider code and sends real model-list, chat,
streaming and cancellation requests. It never substitutes a mock transport,
server, or response. It consumes the configured service's normal quota.
IA_REPRODUCE_BASELINE=1 also demonstrates the routing bug using commit ea2d699;
the baseline check requires that commit to be available in the local Git history.

Assertions cover per-connection IDs, routing with a wrong first endpoint,
fail-closed lookup, settings migration, real 401 responses, a substantial
completed reply, and cancellation after real partial output.
The reasoning regression executes a real filesystem read tool and checks
DeepSeek reasoning passback across tool results, a new user turn and legacy
history, while preserving strict serialization for other compatible APIs.

This command does not automate the native UI. Separate real Obsidian UI evidence
is recorded in test-results/codex-ux-fixes-2026-11-03/screens/ and the report there.
Ollama-specific behavior is outside this test scope. Existing CI/mock suites are
not invoked by this command. Do not put API keys in source files or reports.

Architecture acceptance (no mocks): npm run test:real:architecture
Requires IA_REAL_API_KEY and IA_MCP_SERVER, the absolute path to an installed
@modelcontextprotocol/server-filesystem/dist/index.js reference server.
The local acceptance used server-filesystem 1.0.0 installed under a temporary
folder, outside this repository. Missing credentials/server fail closed.

The architecture runner bundles unchanged production modules, removes only
unused external host imports by normal tree-shaking, and uses real filesystem
port implementations, real Node processes, the real MCP server and real HTTP.
It does not emulate Obsidian. Native host flows are checked separately through
the real Obsidian UI. Serialization/source checks are labeled separately from
live-service checks. SAP and Ollama are never called by this runner.
Native Anthropic/Gemini conformance requires separate real credentials; the
local suite checks their production request builders without a fabricated response.
The multi-step filesystem case is a functional task, not a duration soak test.
The release gate requires the existing separate long-duration real Obsidian test
and verifies that required suites ran rather than being skipped.

Sustained tasks and recovery (no mocks)

node tests/real/sustained-tasks.mjs runs a real Manifold-backed kernel with a
real CLI batch workload, costly PBKDF2 processing and atomic artifact checkpoints.
IA_SUSTAINED_BATCHES=64 and IA_SUSTAINED_ITERATIONS=300000 were used for the
longer acceptance. The explicit workflow contract requires the bound tool until
verified.json exists. DeepSeek rejects forced tool choice in thinking mode, so
this workload explicitly uses IA_SUSTAINED_THINKING=disabled. This does not
change application defaults or certify free-agent completion reliability.

The runner tests Stop during real CPU work, absence of post-Stop commits, fresh
process recovery, and SIGKILL between tool side effects followed by recovery.
Checkpoint idempotency belongs to the real workload tool, not a generic plugin
exactly-once guarantee. No fabricated tool results or fake HTTP server are used.
An earlier default-thinking free agent stopped prematurely; that evidence is
retained in test-results/sustained-tasks-2026-11-04/premature-answer-attempt/.

The context and metadata runners use actual captured histories and exact prior
compiled production bundles, plus a fresh real request for the metadata repair.
Run sustained-context-checks.mjs against the preserved evidence directory; run
sustained-metadata.mjs with IA_REAL_API_KEY. Native Stop/reload/explicit Continue
was independently tested in Obsidian with 32 dependent read-only source files.

Recovery is explicit. The coordinator and working model loop remain in memory;
the journal is evidence, not an automatic durable workflow engine. A crashed or
pending external tool may already have committed a side effect. Inspect actual
artifacts before retrying; the plugin does not automatically replay writes.

Free Agent under service-default thinking

node tests/real/free-agent.mjs uses the production completion guard and context
assembler with actual Manifold calls, auto tool choice, actual CLI processing,
and actual checkpoints. It never forces a tool, tests for artifact existence to
control continuation, disables thinking, or lowers reasoning effort. Independent
post-run checks compare the untouched model JSON to the initial file snapshot,
newly processed IDs, exact counts and complete checksum.

The final run used IA_SUSTAINED_BATCHES=32, IA_SUSTAINED_ITERATIONS=300000 and
a 16,384-token output test budget. Wire request bodies are retained without
credentials. The initial 48-batch attempt hit a genuine 180-second transport
timeout after 39 commits; that acceptance used the then-normal 300-second total
deadline, retained that failure, and explicitly resumed its remaining nine batches.
The current driver uses the application defaults unless IA_FREE_HTTP_TIMEOUT_MS
is explicitly supplied; the later follow-up below distinguishes idle and total limits.
No automatic network POST retry or duplicate checkpoint commit is introduced.

IA_FREE_PRELUDE=1 is an explicitly controlled real-model liveness probe: the
model first produces a progress-only acknowledgement, then the production guard
continues the same task. This is a test prompt, not a substituted response.
free-agent-plan-only.mjs verifies with a real model that checking a plan-only
answer does not execute enabled tools. free-agent-policy.mjs labels its offline
checks on historical real inputs separately from live tests. Wire/provenance
auditors independently inspect actual captured bodies, tool audit logs and files.

Default-thinking architecture regression: set IA_REAL_CONTROL_MAX_TOKENS=16384
and leave IA_REAL_CONTROL_THINKING unset. This gives short controls room for
reasoning without changing application defaults or the explicit limit test.

Long-task timeout and factual-scope follow-up (no mocks)

node tests/real/long-task-timeouts.mjs runs actual Manifold streaming calls.
The preserved baseline demonstrates an active stream cut off by a diagnostic
5-second total deadline. The corrected stream uses a diagnostic inactivity limit
and hard cap; explicit total deadlines, real-byte-gap cancellation and user Stop
remain effective. The 5-second/1-ms controls are deliberately short live test
limits, not application defaults. Exact original request 85 can also be replayed
without executing any returned tool calls. No external timeout cause is inferred
from this replay. A validate-existing mode checks the actual saved SSE document
offline, with no response replacement or new service call.

node tests/real/long-task-claim-review.mjs sends preserved real evidence and an
actual incorrect answer to a new real default-thinking correction request. A
failed initial correction is preserved separately. The final corrected JSON and
scope claims are checked independently; this does not prove arbitrary prose.
IA_FREE_SCOPED_REPORT=1 adds exact per-batch, cumulative, pre-existing-work and
new-work quantities to the free Agent's real workload acceptance. Source hashes
in each new worker result identify the actual production revision it used.

Exact derived-value testing found a genuine model subtraction error, preserved
in arithmetic-failure-preserved/. The production policy requires verified
computation for exact derived values. The actual workload CLI adds a read-only
summary operation that calculates scoped values from real source/checkpoint
files; it does not simulate responses or patch the model answer. This operation
is acceptance tooling, not a new plugin tool or UI control. The final workload
must choose it through auto tool choice, and independent post-run checks still
recalculate all quantities. Mental arithmetic alone is not certified.

Agent action reliability follow-up

IA_AGENT_ACTION=1 on free-agent.mjs declares a trusted source contract on the
real CLI workload: process.token must come from a successful inspect for the
same batch in this run, with a fresh receipt required after dispatch. This uses
the production RegistryToolRunner enforcement, not a test-only loop predicate.
IA_ACTION_CHALLENGE=1 with --action-quick is a controlled real-model request to
propose an unsupported parameter before reading; the evidence must show host
rejection before CLI spawn and subsequent real read/process recovery. It is not
a natural error-frequency benchmark. --prelude-only independently probes real
progress-to-execution repair. Normal long tasks retain auto tool choice and send
no thinking/reasoning_effort fields. Source contracts are opt-in trusted metadata,
not a promise that arbitrary undeclared tools are protected from parameter guesses.

agent-action-contracts.mjs uses actual CLI processes, files and CPU work for
missing-read, mismatched-value/target, replay, fresh-run and failed-refresh checks.
Its historical skip analysis reads preserved real journals. It substitutes no
model/tool/HTTP response; fixed local fixture data is not an emulated service.

Source rejection accounting is separate from actual tool errors: each rejected
proposal costs a step, two consecutive rejects without successful tool progress
stop incomplete, and three actual tool failures still exhaust the failure budget.
The --action-quick negative probe may be requested with IA_ACTION_CHALLENGE=2 and
IA_EXPECT_SOURCE_STOP=1. Its expectation must NOT be treated as coverage if the
real model instead avoids unsupported calls; the preserved run did exactly that.
agent-action-audit.mjs reconciles actual dispatches with source reads and rejects,
checks default thinking and no forced tools, and compares source hashes. It does
not fabricate a required negative response or replace a failed model outcome.
