# Obsidian-Native Agent Design

## Goal

Move Intelligence Assistant from a feature collection toward an Obsidian-native agentic knowledge assistant.

The first implementation slice builds the foundation only: native Obsidian entry points, safe task prompts, and ChatView handoff into Agent mode. It does not build a new workflow engine, multi-agent system, or full diff/writeback runtime.

## Product Positioning

Intelligence Assistant should be presented as an Obsidian-native Agent that understands notes, selections, files, folders, links, metadata, and vault context.

The user-facing loop is:

1. Ask
2. Understand
3. Propose
4. Preview
5. Apply

For this slice, the plugin reaches step 3. File-changing operations must be phrased as proposals. Automatic writeback and batch file mutation are out of scope until the safe diff/review system exists.

## Scope

### In Scope

- Add Command Palette entries for current note and selection tasks.
- Add file menu entries for file and folder tasks.
- Open the existing ChatView and switch it to Agent mode when these entries are used.
- Attach the active note, target file, or target folder as references where possible.
- Build deterministic task prompts that tell the Agent to cite Obsidian sources and propose changes before writing.
- Update default prompt/copy so new users see the plugin as an Obsidian knowledge Agent rather than a generic chat/tool hub.

### Out of Scope

- Multi-agent orchestration.
- A workflow builder.
- Automatic writeback without review.
- Full patch/diff review UI.
- RAG v2 source rendering changes.
- Settings home redesign.

## Architecture

### Prompt Builder

Create a small pure module that turns Obsidian actions into Agent prompts:

- current note question
- current note summary
- current note organization proposal
- selection improvement
- file summary
- folder organization proposal

This module is pure and easy to test. It should not import Obsidian.

### ChatView Handoff

Add a public method to `ChatView`:

```ts
startAgentTask(options: {
  prompt: string;
  references?: Array<TFile | TFolder>;
  sendImmediately?: boolean;
}): Promise<void>
```

The method should:

- switch to Agent mode;
- ensure there is an active Agent;
- add references to the input reference list;
- populate and focus the input;
- optionally send immediately.

For the first slice, commands should prefill and focus instead of automatically sending. This keeps the action safe and inspectable.

### Plugin Entry Points

Register commands and menus in `main.ts`, because plugin lifecycle and workspace event registration already live there.

New commands:

- `Ask Agent about current note`
- `Summarize current note with Agent`
- `Organize current note with Agent`
- `Improve selection with Agent`

File menu entries:

- `Ask Agent about this file`
- `Summarize with Agent`
- `Organize folder with Agent`

### Safety

Prompts must explicitly say:

- use referenced Obsidian content as primary context;
- cite relevant notes with Obsidian links when useful;
- propose file/property/link changes before modifying anything;
- do not write files unless the user confirms.

## Testing

Unit tests should cover prompt builder behavior:

- current-note prompts include the file path and safety instruction;
- selection prompts include the selected text and do not require a file;
- folder prompts ask for a proposal/review queue, not direct mutation.

ChatView/Obsidian UI wiring can be covered by focused unit tests later, after this foundation lands. This slice should at least compile and keep existing tests green.

## Acceptance Criteria

- The plugin has Obsidian-native Agent commands for active note and selected text.
- File/folder menus expose Agent actions.
- Triggered actions open ChatView in Agent mode, attach references, and prefill a task prompt.
- No command silently modifies the vault.
- Default new-user copy moves away from generic chat toward Obsidian-native Agent positioning.
