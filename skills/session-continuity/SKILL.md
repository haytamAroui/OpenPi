---
name: session-continuity
description: Use when context is long, resuming work, summarizing progress, nearing compaction, or preparing to stop.
---

# Session Continuity

Use `/compress` or the `context-pruner` agent to produce a continuation brief.

The brief should include:

1. Current objective.
2. User constraints.
3. Files changed or inspected.
4. Commands run and outcomes.
5. Decisions made.
6. Remaining work.
7. Risks and blockers.

Do not solve new work during compression. Preserve exact paths and command outcomes.
