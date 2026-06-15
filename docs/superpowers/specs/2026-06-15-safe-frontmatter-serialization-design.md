# Safe frontmatter serialization for `update_properties`

**Date:** 2026-06-15
**Status:** Approved (approach A)

## Problem

`UpdatePropertiesTool.execute()` (`src/application/services/file-tools.ts`) builds
the new YAML frontmatter **by hand** (string concatenation, `String(value)`, no
escaping). This corrupts the note for any value that needs quoting/escaping:
- values containing `:`, `#`, leading/trailing spaces, or starting with special chars,
- multi-line strings,
- nested objects (serialized via `JSON.stringify`, which is not YAML),
- booleans/numbers vs strings ambiguity.

The tool returns a `WriteProposal('update', proposedContent, …)` that flows through
the approval / autonomous-apply gate. That model is good and must be preserved.

## Decision

**Approach A:** Serialize the frontmatter with Obsidian's `stringifyYaml` (a safe,
Obsidian-native YAML serializer), keeping the proposal model intact.

Rejected:
- **B (direct `fileManager.processFrontMatter`)** — writes directly, bypassing the
  proposal/approval and `autonomousWrite` gate. Changes the safety model.
- **C (hybrid: proposal + apply via `processFrontMatter`)** — preserves the model
  and adopts `processFrontMatter`, but requires a new proposal shape + a
  frontmatter branch in the generic apply path. Disproportionate for this fix.

## Change

Only the YAML-construction block in `UpdatePropertiesTool.execute()` changes:
```ts
import { stringifyYaml } from 'obsidian';
// ...
const body = content.replace(/^---[\s\S]*?---\n?/, '');
const proposedContent = Object.keys(newMetadata).length > 0
  ? `---\n${stringifyYaml(newMetadata)}---\n${body}`
  : body; // all properties removed -> emit no frontmatter block
```
Unchanged: read existing props via `metadataCache.getFileCache(file)?.frontmatter`,
merge `updates`, apply `deleteKeys`, drop the `position` key, return the same
`WriteProposal` with `operation: 'update'`.

## Testing

A unit test for `UpdatePropertiesTool` (mock `app` with `vault.read` +
`metadataCache.getFileCache`):
- Updating a property to a value containing `:` (and an array, and a nested
  object) → `parseYaml` the resulting proposal frontmatter and assert it
  round-trips to the intended values. (The hand-rolled impl fails the `:` case.)
- Removing all properties → `proposedContent` has no `---` block.
- The result is still a `WriteProposal` with `operation: 'update'` (proposal model
  preserved).

## Capability manifest

- `stringifyYaml` → `used` (linked to the new test).
- `fileManager.processFrontMatter` → `n/a` (reason: incompatible with the
  proposal/approval model; safe serialization achieved via `stringifyYaml`).
