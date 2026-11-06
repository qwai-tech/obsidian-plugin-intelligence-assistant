# Verification Gate repair — 2026-11-05

The independent [Verification Gate workflow](../../.github/workflows/verification-gate.yml) failed on the published 0.1.0 source because many fixtures still described earlier execution contracts. The failure was reproduced locally: **145 failed, 1,102 passed, 2 skipped**. The mutation job also stopped during its initial Jest dry run, before measuring mutations.

This repair updates tests and their environment. It changes no application behavior, UI, dependency, version, workflow, coverage threshold or mutation threshold. The publisher's removed `real-verification` job remains removed. Version 0.1.0 is already published; an existing version tag prevents these test changes from publishing it again.

## Updated contracts

- Agent fixtures capture discovered tool bindings and dispatch through those bindings. New tests verify task allowlists, missing bindings, cancellation before dispatch and cancellation before proposal application.
- An Agent completion needs an explicit completion marker and the host's factual review turn. Scripted mission replies now include both turns. Efficiency baselines increase by exactly one model turn; tool-call counts and the exact-equality performance oracle remain unchanged. Empty and incomplete responses still fail.
- Prompt text cannot authorize automatic writes. Tests require the Agent setting and an approved host action, and explicitly reject an unapproved external task.
- SSE fixtures use complete event frames and provider completion markers. Malformed, truncated, empty and cancelled streams must fail without emitting successful completion. A CORS fallback retains the streaming endpoint and protocol.
- Persistence fixtures support actual adapter operations, atomic staging and canonical `data.json`. Corrupt JSON is rejected without overwriting its bytes; failed indexing leaves no partial vectors; explicit flush verifies debounced persistence.
- UI tests follow the restored nine settings Tabs, reviewed editor replacements and manual AI-block execution. They do not restore obsolete UI behavior.
- The Jest host installs its notification sink and uses Node's real `Blob.stream()` implementation. The untranslated-text scanner examines literal prose rather than identifiers inside template expressions, with regression cases for prose before and after interpolation.

## Validation and scope

The repaired complete local coverage run recorded **1,261 passed, 0 failed, 2 skipped** across 178 passing suites. The two skips already existed in the baseline; this repair adds no skips. Lint, both type checks, the Obsidian API audit, development build and deployment to the isolated QA vault passed. The mission suite completed **20 identical soak runs**, with 43 passing tests per run. The forced-GC memory check completed 40 iterations with a second-half/first-half heap ratio of **1.00**.

The workflow independently reruns these checks and the existing mutation gate on a normal push. Mutation testing keeps its **85%** minimum and both original mutation targets. Use the Actions result for the pushed commit to establish remote success; a local result alone does not establish a remote pass.

These are deterministic tests using the repository's existing mock infrastructure. They are not new real-service acceptance or visual tests. No live Ollama or SAP call is included. The earlier real-service certificates retain their own version and bundle scopes.

Generated diagnostics are local and ignored:

```text
test-results/verification-gate-fix-2026-11-05/
```

That directory retains the failed baseline, incremental failures, final coverage JSON/log, soak and memory logs, static/build/deployment logs and mutation output. Check current [Actions runs](https://github.com/qwai-tech/obsidian-plugin-intelligence-assistant/actions/workflows/verification-gate.yml) for both the deterministic and mutation job verdicts.
