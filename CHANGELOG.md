# Changelog

## [0.1.1]

This patch includes all features and fixes from 0.1.0. Its change list is repeated below so users upgrading from an earlier release can see the complete scope.

### Changes in 0.1.1

- Address Obsidian source-review findings: use explicit Node timers for application deadlines, the supported destructive-button API and native Obsidian DOM helpers. Remove redundant type assertions and prevent the two forbidden lint suppressions from returning. The existing UI layout and styling are preserved.
- Repair deterministic verification fixtures for the current Agent authorization, bound-tool dispatch, factual completion review, SSE termination, cancellation and persistence contracts. Keep coverage and mutation thresholds unchanged.
- Add focused real timer/process checks for deadlines, cancellation, actual child output, environment-variable isolation and executable lookup.
- Generate GitHub Release notes from this version's changelog entry so the published notes include both the patch changes and the inherited 0.1.0 change list.

### Included changes from 0.1.0

- Provider-instance model identity and configuration handling, restored SAP AI Core code, and shared provider construction/discovery.
- Tool permissions, stale-binding rejection, literal CLI arguments and scoped subprocess environment inheritance.
- Explicit host/Agent automatic-write authorization, proposal/applied-state handling and user-triggered external task entry points.
- Bounded context, incomplete-output/timeout reporting, manual Stop/Continue checkpoints, separate run counts and actual-count checks.
- Settings migration/persistence, source cache handling, notification and accessibility fixes, restored nine top-level settings Tabs and 49 locale resources.

### Compatibility

Obsidian Desktop 1.13.0 or later. Live Ollama and SAP calls remain outside the current validation scope. Inherited changes are not newly executed real-service tests.

## [0.1.0] - 2026-11-05

- Provider-instance model identity and configuration handling, restored SAP AI Core code, and shared provider construction/discovery.
- Tool permissions, stale-binding rejection, literal CLI arguments and scoped subprocess environment inheritance.
- Explicit host/Agent automatic-write authorization, proposal/applied-state handling and user-triggered external task entry points.
- Bounded context, incomplete-output/timeout reporting, manual Stop/Continue checkpoints, separate run counts and actual-count checks.
- Settings migration/persistence, source cache handling, notification and accessibility fixes, restored nine top-level settings Tabs and 49 locale resources.

See [0.1.0 validation and publication](docs/releases/0.1.0.md) for the original version and evidence scopes.
