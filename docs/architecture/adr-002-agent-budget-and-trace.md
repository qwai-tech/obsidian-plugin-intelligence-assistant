# ADR-002: Host step allowance, model estimates and truthful traces

Status: Accepted; amended after the real release gate on 2026-11-05.

## Step budget

The initial allowance is `agent.maxSteps ?? DEFAULT_MAX_STEPS` (25). The engine supplies an estimate ceiling of `max(MAX_STEPS_CEILING, configuredAllowance)`; the constant ceiling is 50, while a larger explicitly configured allowance is preserved.

On the first turn, `Budget.estimate` can consume `<!-- ESTIMATED_STEPS: N -->` and strip the marker from model text. For a positive estimate:

```text
workingLimit = max(currentLimit, 10, min(N + 3, estimateCeiling))
```

An estimate can raise the allowance but cannot revoke the configured allowance. The previous clamp-only formula reduced a configured 16 steps to 10 during a real linked-note task; that was corrected before the complete live gate.

A step is a tool attempt, not an article or model turn. Preflight rejections consume steps but are separate from executed-tool failures. The current engine allows three actual failures; reaching a limit produces a typed budget outcome. Budget completion is not task completion. The host's step-budget message reports actual successful read calls and supports a manual continuation with a new run receipt.

## Trace and completion facts

Tool calls/results are the execution trace. Model reasoning is displayed only when actually supplied by the provider. SPAR-style prompts are guidance, not evidence of separate autonomous subsystems or guaranteed transparent reasoning.

Named guard/correction events and budget messages may be host-generated. They must be distinguishable from completed tool effects. `ExecutionCountGuard` checks supported runtime count fields and recognized explicit read-count claims before accepting a tool-free answer. Current-run and previous-run counts are scoped separately.

These checks are bounded. They do not validate every number, language, paraphrase or domain calculation. Actual artifacts and tool logs remain the acceptance oracle.

See [execution contracts](execution-contracts.md) for context compaction, continuation and argument-evidence rules.
