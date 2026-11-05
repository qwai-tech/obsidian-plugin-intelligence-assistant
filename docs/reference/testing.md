# Testing and release evidence

The repository contains both real-service checks and mock-based suites. Choose deliberately: `npm run verify` is not a no-mock command. Test code existing in the repository does not establish that it ran for a particular candidate.

## Test routes

| Route | What it exercises | Command / scope |
|---|---|---|
| Static | Lint, layer rules and source/test type configurations | `npm run lint`, `npm run typecheck`, `npm run audit:obsidian-api` |
| Unit / missions / performance | Pure logic, mocked Obsidian/LLM infrastructure, in-memory scenarios and bounded performance checks | Jest, `npm run test:missions`, `npm run test:perf`, `npm run test:perf:mem` — includes mocks |
| Determinism / mutation | Repeated mission outcomes and injected faults | `npm run test:flake-soak`, `npm run test:mutation` — includes mocks |
| CI E2E | Actual Obsidian with deterministic mock LLM/MCP servers | `npm run test:e2e:ci`, `npm run test:e2e:smoke` — includes mocks |
| Individual release specs | Real configured services in actual Obsidian; some optional specs can skip without their configuration | `npm run test:e2e:release`; inspect the selected specs and skips |
| Complete real release gate | Four mandatory real cases on one frozen production bundle, with fresh evidence and no skipped mandatory suite | `npm run verify:release:real` |
| Real component/audit scripts | Actual disk/process/MCP/network paths, plus clearly labeled replays of captured failures | `tests/real/`; read each script's required variables and scope |
| Visual tour | Actual host screenshots for manual review | `npm run test:e2e:tour`; screenshots alone do not prove backend behavior |

If mocks are prohibited, do not run Jest/mission/performance/CI E2E merely to obtain a green result. Static checks, appropriate real scripts and the real release runner are the applicable routes. Ollama and SAP exclusions in the current preparation are explicit; they are not automatically certified by another provider's result.

## Complete real release gate

Commit candidate changes, run the project-required checks/development build, then finish with a production build from that exact commit:

```bash
npm run lint
npm run typecheck
npm run build
npm run build:production
```

Supply real credentials through the local environment or secret manager. Do not commit keys or print complete settings. For a custom OpenAI-compatible endpoint, configure:

```text
E2E_TEST_PROVIDER=custom
E2E_TEST_API_KEY=<real credential supplied outside the repository>
E2E_TEST_BASE_URL=<reachable real API base URL>
E2E_TEST_MODEL=<actual enabled model ID>
```

Then run:

```bash
npm run verify:release:real
```

The runner disables `.env.test` loading for its child, freezes `main.js`, `styles.css` and `manifest.json`, verifies production input hashes/source identity and installs the frozen files in actual Obsidian 1.14.5. It requires clean committed tracked source and does not allow a known mock endpoint. It runs these four cases without spec retries:

1. **Real chat:** persisted response and positive actual token usage.
2. **Real Agent:** successful built-in `read_file` with the source sentinel in the reply.
3. **Linked-note task:** all four requested Markdown files, required content/links and an `answered` terminal receipt.
4. **Continuous long task:** all requested numbered articles, each at least 1,200 words by default, all index links, a true completion marker and `answered` outcome, plus at least 20 minutes of actual Agent journal duration by default.

`LONG_TASK_NOTES` defaults to 60; the recorded acceptance run used 100. The Agent profile includes a real read-only CLI checker over the isolated vault; it measures saved files, lets the Agent expand short articles, and performs a final aggregate. The test independently reads and counts the saved contents. This is a tool-enabled workload, not proof a model can mentally count words.

The long gate requires every artifact, not an earlier partial percentage. Waiting after the Agent finishes cannot satisfy duration. A workload that completes too soon fails; use a sufficiently substantial real workload rather than idle padding. Service errors, incomplete output, missing artifacts and failed/skipped mandatory cases cannot become a pass.

## Evidence and verification

The generated run directory contains the manifest, frozen bundle, production provenance, fresh JUnit, case screenshots, persisted conversations, actual journals and captured products. Each case checks the installed three-file hashes. The verifier rejects stale/mixed/partial evidence and preserves the actual tested source commit.

Use `IA_RELEASE_REPORT_ROOT` to select a new, nonexistent output directory. A transparent real-service recorder is optional; `IA_RELEASE_SERVICE_AUDIT` connects its metadata to the verifier. In the recorded run it forwarded request/response bodies unchanged, saved hashes/status/usage, excluded authorization headers and checked known reasoning overrides. Browser OPTIONS probes are retained separately from actual application calls; failed application calls remain failures.

WDIO can sanitize a suite name (for example a hyphen becomes a space). The verifier recognizes that reporter transformation while checking case identity and raw JUnit hashes. The historical post-processing repair used an explicit tooling-only recheck: restricted paths, byte-identical emitted JavaScript for the one allowed test-formatting file, unchanged production inputs/assets, and separate tested-source/verification commits. It does not authorize reuse after changing application code, test prompts, oracles or timeouts.

Results for the current preparation are summarized in [0.1.0 status](../releases/0.1.0.md). Local generated evidence is ignored and is not available to another reader merely because a localhost report URL worked on the test machine. Record artifact identity and scope in committed summaries; share redacted evidence separately when needed.

## CI behavior and publication

- `.github/workflows/e2e.yml` has an every-push mock E2E job and a conditional real-spec job for main/tags.
- `.github/workflows/verification-gate.yml` contains deterministic/mock verification and mutation jobs for main/master and PRs.
- `.github/workflows/ci-cd.yml` can build, real-verify and publish an untagged version on a main/master push. It passes the built artifacts between jobs instead of rebuilding after verification.

The publisher's job chain is `check` → `build` → `real-verification` → `release`. The separate E2E Tests and Verification Gate workflows are not release-job dependencies. A version tag that already exists makes the publisher skip the release; let it create the tag after verification. Tag-only pushes do not trigger this publisher, and it currently has no manual dispatch entry point.

Configure `E2E_TEST_PROVIDER`, `E2E_TEST_API_KEY` and `E2E_TEST_MODEL` as available Actions secrets, plus `E2E_TEST_BASE_URL` for a custom endpoint. The endpoint must be reachable from the GitHub-hosted runner. The real gate requires its own fresh evidence and does not silently accept a prior local certificate.

The current instruction is to update documentation and push normally **without CI skip markers**, retaining the existing workflows. Earlier preparation commits used skip markers; that is historical, not the current publication procedure. Normal CI includes the independent mock-based suites. Repository branch protection/secrets and real-service availability are external configuration; no remote CI result is implied by local tests. Skipped checks are not passing checks.

The skip marker does not disable independently triggered checks. GitHub's dynamic CodeQL workflow can still perform static analysis on the pushed commit; it does not run the repository's mock suites or publish the plugin. Inspect workflow identity and jobs before classifying a remote run.

## Test locations and useful rules

- `src/**/__tests__/`, `packages/obsidian-llm/src/__tests__/`: unit tests.
- `tests/harness/`, `tests/missions/`, `tests/perf/`, `tests/mutation/`: deterministic/mock infrastructure and checks.
- [E2E guide](../../tests/e2e/README.md): actual host fixtures, page objects, release cases and diagnostics.
- [Real script notes](../../tests/real/README.txt): real filesystem/process/network experiments and captured-evidence audits.

Use specific observable outcomes and persisted state, not merely a completion sentence. Preserve failed attempts as failed evidence. Distinguish an actual new service call, a real process/file operation and a replay of captured data. For settings assertions, use current `data.json`; the legacy template is migrated during startup. The count guard does not certify arbitrary prose/numbers, and a screenshot does not substitute for an execution or artifact oracle.

[Performance notes](performance.md) contain separately scoped historical and current measurements.
