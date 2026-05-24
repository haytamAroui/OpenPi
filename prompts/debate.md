---
description: Adversarial decision protocol for hard tradeoffs
category: planning
aliases:
  - decide
---

Run an adversarial decision protocol for:

$ARGUMENTS

Use this only for decisions that are costly to reverse or where criteria conflict.

Process:

1. Frame the decision and list the options.
2. State the decision criteria and their priority.
3. Use `spawn_agents` with `thinker`, `red-team`, and `plan-reviewer` when useful.
4. Steelman each option before comparing.
5. Search for a third option or hybrid if both obvious options are weak.
6. Return the winner, confidence, deciding evidence, and rollback plan.

Do not edit files.
