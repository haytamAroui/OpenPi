---
description: Write a mid-session checkpoint to survive context compaction
category: context
aliases:
  - checkpoint
---

Write a Pi-native session snapshot.

Topic:

$ARGUMENTS

Process:

1. Use `session_state` to read current goals and latest checkpoint.
2. Summarize only durable context needed to continue.
3. Use `write_snapshot` with:
   - current task
   - decisions
   - known context
   - next actions
   - risks
4. Print the checkpoint path and content.

Do not solve new work during snapshotting.
