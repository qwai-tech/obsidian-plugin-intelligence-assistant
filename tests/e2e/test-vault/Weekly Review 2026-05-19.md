# Weekly Review — 2026-05-19

## What I shipped

- Intelligence Assistant v0.0.6 — MCP integration stable, RAG indexing optimized
- Chat bubble redesign (CSS-only, no TypeScript changes)
- ProductHunt launch prep materials

## What I learned

- Cross-encoder re-ranking adds ~40ms latency but improves RAG precision measurably
- MCP tool catalog caching at startup eliminates cold-start penalty
- Obsidian's `display: contents` trick allows CSS `order` to reflow DOM children cleanly

## Blockers

- None this week — clean shipping week

## Next week

- [ ] Execute Chat UI redesign plan (Tasks 1–5)
- [ ] Submit to Obsidian Community Plugin store
- [ ] ProductHunt launch

## Reflection

Good week. The decision to keep the redesign CSS-only paid off — zero TypeScript churn, all visual changes are reversible.

## Tags

#weekly-review #shipping
