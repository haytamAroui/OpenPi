---
description: Deep evidence-led reasoning for hard bugs, architecture, or plans
category: planning
aliases:
  - think
  - ultrathink
---

Use ultrathink mode for this task:

$ARGUMENTS

Process:

1. Interpret whether this wraps another command. If it starts with `/blueprint`, `/add`, `/fix`, `/debate`, `/ship`, or another command, follow that command's workflow with deep mode enabled.
2. Gather evidence first with `env_scan`, `project_tree`, `code_search_batch`, or `spawn_agents` using `file-picker` and `code-searcher`.
3. Consider at least 2-3 plausible approaches or root causes before choosing.
4. Trace downstream effects across files, APIs, data, tests, UX, and operations.
5. Use `spawn_agents` with `thinker` only after evidence is available.
6. If a plan is produced, use `plan-reviewer` to challenge assumptions, order, tests, and risks.
7. Return a concrete next patch or decision, not generic advice.

Separate confirmed facts from inference. Include file paths and validation steps.

Output contract:

```text
Deep read: {one-line task interpretation}
Decision: {chosen path or answer}
Why:
- {evidence-backed reason}
- {tradeoff}
Next: {verification command or implementation step}
```

Do not expose hidden reasoning. Keep the final output concise.
