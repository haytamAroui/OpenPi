---
description: Pre-ship gate for tests, security, dependency risk, and git readiness
category: quality
aliases:
  - preflight
---

Run a pre-ship gate for:

$ARGUMENTS

Do not commit or push unless the user explicitly asks for that exact action.

Gate:

1. Run `env_scan`.
2. Run `secret_scan`; blocking findings stop ship.
3. Run `ghost_test_scan`; suspicious findings require inspection.
4. Run `dependency_inventory`; missing lockfiles or loose pins become risk notes.
5. Inspect `git status --short` and `git diff --stat`.
6. Run the smallest relevant test/build/typecheck commands from project scripts.
7. Use `spawn_agents` with `problem-architect` for risk scan and `reviewer` for diff review when useful.

Output:

- Ship verdict: GO | BLOCKED | RISK ACCEPTANCE NEEDED
- Changed files
- Commands run and exact outcomes
- Blocking issues
- Commit message suggestion if GO
