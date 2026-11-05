# Developer guide — 0.1.0

[中文](project-guide-zh.md) · [Architecture](../architecture/overview-en.md) · [Testing](../reference/testing.md)

## Build and local deployment

Use Node.js 22, as in the build/publish workflow, and install with the committed lockfile:

```bash
npm ci
npm run lint
npm run typecheck
npm run build
npm run build:production
```

`build` creates a development bundle; `build:production` creates the production bundle and `artifact-provenance.json`. Both validate source and run TypeScript checking unless explicitly overridden. The provenance records the source commit, input-file hashes and hashes of `main.js`, `styles.css` and `manifest.json`.

Deploy only to a disposable QA vault:

```bash
OBSIDIAN_PLUGINS_PATH=/absolute/path/to/qa-vault/.obsidian/plugins node scripts/deploy.js --local
```

Use that vault's real configuration directory if it differs from `.obsidian`. Confirm the deployed file hashes and actual loaded version. Keep runtime state and credentials out of source commits. `npm run dev` is the development/watch workflow, not a release bundle.

## Read the runtime in this order

1. [`main.ts`](../../main.ts): registration, settings load, startup/deferred work and lifecycle.
2. [`create-services.ts`](../../src/bootstrap/create-services.ts): service ownership/composition.
3. [`settings-store.ts`](../../src/features/settings/settings-store.ts) and [`obsidian-settings-persistence.ts`](../../src/bootstrap/obsidian-settings-persistence.ts): state transactions and actual storage.
4. [`chat-view.ts`](../../src/ui/views/chat-view.ts) / [`chat-controller.ts`](../../src/ui/chat/controllers/chat-controller.ts): UI request flow.
5. [`agent-engine-loop.ts`](../../src/features/agent/agent-engine-loop.ts), [`turn-kernel.ts`](../../src/features/agent/kernel/turn-kernel.ts) and [`task-checkpoint.ts`](../../src/features/agent/task-checkpoint.ts): policy, execution and manual continuation.
6. [`tool-source-manager.ts`](../../src/features/tools/tool-source-manager.ts) and [`tool-registry.ts`](../../src/features/tools/tool-registry.ts): source lifecycle, identity and dispatch.
7. [`provider-definitions.ts`](../../packages/obsidian-llm/src/provider-definitions.ts) and [`request-budget.ts`](../../packages/obsidian-llm/src/request-budget.ts): provider construction/discovery and bounded wire requests.

The [source map](../reference/project-structure.md) describes directory ownership. Consult `eslint.config.mts` for actual import restrictions rather than assuming every feature is host-independent.

## Persistence

Current settings are a format-2 document in `<plugin>/data.json`: configuration, provider definitions, prompts and Agents. Updates go through `plugin.updateSettings(change)`. `SettingsStore` serializes local changes, validates documents and restores working state after failed persistence. The adapter uses Obsidian `saveData` and keeps `data.json.bak`.

Legacy `config/user/settings.json` and separate settings repositories are read by `LegacySettingsFiles`, migrated, then removed after a successful save. Tests reading that old path after migration are incorrect; inspect current `data.json` or use runtime helpers.

Other records remain under `data/`: per-conversation JSON, Agent JSONL journals, caches, usage, memory and the vector index. `JsonFile` supplies temporary-file/rename recovery to repositories that use it. Do not generalize that into multi-file, cross-process or Sync atomicity.

`SecretVault` is implemented with Obsidian SecretStorage. Provider/SAP/search/OpenAPI credential fields keep references on disk and reveal values in runtime settings. Arbitrary CLI/MCP environment values are not automatically stripped. Never dump complete runtime settings into test output.

## Tools, effects and integrations

- Register built-ins in `sources/builtin-tool-source.ts`, validate parameters and declare side effects.
- A built-in vault-write tool must return a supported proposal without writing first. Automatic application requires the Agent setting plus a host-approved task.
- CLI/MCP/HTTP tools are externally configured capabilities, not sandboxed extensions of the built-in proposal gate.
- Use source resynchronization when adding/removing source definitions; reloading an existing registry alone does not register a new source.
- Keep tool bindings stable for a run. A source reload must reject an old binding instead of rerouting it to a different tool with the same display name.
- New argument-evidence contracts are explicit trusted configuration; they do not universally infer required source reads from natural language.

For a new provider, update the package's provider registry and the applicable UI metadata, model capabilities and protocol handling. Do not add one construction path while leaving discovery on another. Preserve provider-instance identity for custom connections.

For settings, update the feature type, codec/document validation, migrations and appropriate settings control. For user-visible strings, use `t()` and the bundled locale resources.

## Verification choices

The repository has both mock-based and real tests. `npm run verify`, Jest/missions/performance and CI E2E include mocks. They are not a substitute for a real provider call, and must not run when a session expressly prohibits mocks.

The no-mock release entry point is `npm run verify:release:real`. It requires committed source, a production provenance file and real provider credentials. It freezes one bundle and runs four mandatory cases, including the complete long task. See [testing](../reference/testing.md) for environment variables and acceptance rules. No source/bundle mutation is permitted during the run.

A narrow post-processing repair can recheck preserved evidence only through the verifier's explicit tooling mode: permitted paths are restricted, the one allowed test-formatting change must emit byte-identical JavaScript, raw JUnit hashes are recorded and production inputs/assets must still match. This does not permit changed prompts, timeouts, oracles or application behavior to reuse old results.

## Versioning and publication

`node scripts/version.js minor` updates package.json, manifest.json, versions.json and the root lockfile version fields. Preserve file formatting and review the diff. The library package has its own version; it is not a second plugin manifest.

A source push is not an instruction to create a release. `.github/workflows/ci-cd.yml` can publish automatically on main/master when its conditions and real gate succeed. The every-push E2E workflow also contains mock tests. During the current no-mock/unpublished preparation, the commit carries `[skip ci]` to skip these push/PR test and publication workflows. Independently triggered checks, such as GitHub's dynamic CodeQL static analysis, can still run. Skipping a workflow does not mean it passed. Later publication requires deliberate authorization and applicable candidate checks.
