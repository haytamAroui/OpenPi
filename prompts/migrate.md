---
description: Plan and execute migrations with risk assessment, phased execution, and rollback strategies
category: planning
aliases:
  - upgrade
---

Plan a migration for:

$ARGUMENTS

Process:

1. Use `env_scan` to identify the current stack and versions.
2. Use `dependency_inventory` to audit current dependencies.
3. Use `code_search_batch` to find all touchpoints for the migration target.
4. Use `spawn_agents` with `migration-expert` for detailed migration analysis.
5. If the migration is risky (data loss possible, breaking changes), use `spawn_agents` with `red-team` to challenge the plan.

Output:

```text
Migration: {from} → {to}

Risk: low | medium | high - {why}

Current state:
- ...

Breaking changes:
1. ...

Phases:
1. {phase} - rollback: {strategy}
2. ...

Validation:
- {command or check}

Point of no return:
- {phase N} — after this, rollback requires {strategy}
```

Do not execute destructive operations. Present the plan and wait for approval.
