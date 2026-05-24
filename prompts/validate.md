---
description: Select and run targeted validation for current work
category: quality
aliases:
  - check
---

Validate the current work or this scope:

$ARGUMENTS

Process:

1. Identify the smallest useful validation commands.
2. Use `spawn_agents` with `tester` or `basher` for isolated validation when helpful.
3. Use `reviewer` after validation if code changed.
4. Report exact commands, outcomes, important output lines, and remaining risk.

Do not edit files unless I explicitly ask for fixes.
