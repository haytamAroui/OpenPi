---
description: Plan or run safe parallel agent work with ownership checks
category: workflow
aliases:
  - wave
---

Prepare parallel execution for:

$ARGUMENTS

Use parallel execution only when milestones are independent.

Process:

1. Identify candidate milestones and likely files for each.
2. Use `problem-architect` or `code-searcher` if file ownership is unclear.
3. Run `parallel_safety_check` with milestone ids, files, dependencies, and statuses.
4. If conflicts exist, return the sequential order instead of forcing parallelism.
5. If safe, use `spawn_agents` with `mode: "parallel"` and project role agents.
6. Do not commit, merge, push, delete branches, or create worktrees unless the user explicitly asks.

Output:

```text
Parallel verdict: PARALLEL_SAFE | SEQUENTIAL_REQUIRED

Milestones:
- id - title - files - validation

Conflicts:
-

Dispatch plan:
- Wave 1:
- Wave 2:

Merge/validation gate:
- {commands or review steps}
```

Never say parallel work is safe without a file-ownership and dependency check.
