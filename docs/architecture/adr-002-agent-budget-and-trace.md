# ADR-002: Agent self-estimated step budget & trimmed execution trace

Status: Accepted · Scope: `src/application/agents` (loop + planner), `src/constants.ts`

Two related changes driven by the principle "trust a capable agentic model; remove
fixed scaffolding."

## 1. Step budget: agent estimates, ceiling backstops

Previously `maxSteps` was a single fixed number (10, later 25). A fixed number is
arbitrary — a 2-file task and a 40-file task should not share one budget.

**Decision:** the agent estimates its own budget on the first turn; a hard ceiling
remains as a non-negotiable backstop.

- On its first turn the agent emits an HTML comment `<!-- ESTIMATED_STEPS: N -->`
  (instructed in the system prompt). It is an HTML comment so it is invisible in
  rendered markdown; the planner also strips it from `lastContent` so it never
  reaches history or the final answer.
- The planner sets its working budget to `clamp(N + 3, 10, ceiling)`. If the agent
  declares no estimate, the budget is the fallback (`agent.maxSteps ?? 25`).
- `MAX_STEPS_CEILING = 50` (raised per-agent if the user configures a higher
  `maxSteps`) is the hard cap, enforced by `BasicPolicy` and the kernel agent's
  `maxSteps`. The agent can never exceed it.

**Why a ceiling is mandatory:** the moment a budget matters most is when the agent
is confused and looping — exactly when it will not stop itself ("just one more
step"). Autonomy cannot include self-authorising unlimited steps. The agent already
self-paces normally by emitting `final_answer` when done; the budget only bites
when it wants more, and the ceiling only bites on a runaway/over-estimate.

On hitting the budget the loop stops with a message naming the effective budget and
inviting the user to continue or raise the limit (no silent dead-stop framing).

## 2. Execution trace: drop templated "Thinking" narration

The UI showed `ThinkingPlan / ThinkingReflect / ThinkingAct` bubbles. These were
**synthetic, templated** strings emitted by our code via `onThought`
("Planning step N.", "Reflected on N tool result(s).", "Sensed active note…") —
not the model's reasoning. For a capable agent they are repetitive, zero-information
noise.

**Decision:** remove the three templated per-phase `onThought` calls. Keep what is
real: the tool-call/result cards (the true execution trace and liveness signal), the
model's actual reasoning (`reasoning_content` / streamed content, rendered
separately), the final answer, and genuinely informative events (write-proposal
retry, budget reached). The system-prompt SPAR framing and the first-turn
"Task Checklist" instruction are retained — they guide the model and are real
user-facing output.

## Consequences

- New per-task budgets adapt to the work; the fixed-number problem is gone, bounded
  by a hard ceiling.
- Weak models that omit the estimate fall back to the configured default (25); a
  stronger model is still recommended for large autonomous tasks.
- The transcript is cleaner: tool cards + real reasoning + answer, no filler.
