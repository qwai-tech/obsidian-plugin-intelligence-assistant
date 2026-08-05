/**
 * LLM Infrastructure -- now a thin re-export of the extracted package.
 *
 * The providers, factory and model catalog moved to `@qwai/obsidian-llm` so other
 * plugins can use them without vendoring a copy. This file stays so the existing
 * in-plugin import sites keep working unchanged; new code should import from
 * `@qwai/obsidian-llm` directly.
 */
export * from '@qwai/obsidian-llm';
