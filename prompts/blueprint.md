---
description: Create an implementation blueprint before risky work
category: planning
aliases:
  - plan
---

Create a concise implementation blueprint for:

$ARGUMENTS

Use `/add` for straightforward work. Use this blueprint when the change touches several files, changes contracts, changes data, has unclear risk, or needs approval before editing.

If the request contains `--deep`, apply ultrathink mode:

- gather more evidence before deciding
- consider 2-3 approaches
- trace downstream effects across APIs, data, tests, and UX
- spend extra effort on parallel-safety and coupling analysis

Process:

1. If this is vague, switch to `/clarify` behavior first.
2. If a spec is supplied, use `spec-reviewer` before planning.
3. Use `env_scan`, `project_tree`, and `code_search_batch` to map impact.
4. Identify files likely to change and tests likely to prove the change.
5. Use `parallel_safety_check` when the plan has multiple independent milestones.
6. Use `problem-architect` or `plan-reviewer` for high-risk plans.

Output:

```text
Blueprint: {title}
Risk: low | medium | high - {why}

Goal:
Non-goals:

Evidence:
- file:line - why it matters

Approaches:
1.
2.
3.

Chosen approach:

Milestones:
1. {file:line or path} - {change} - {verification}

Parallel waves:
- Wave 1:
- Wave 2:

Risks:
- {risk} - mitigation

Verification:
- {command or manual check}

Approval gate:
Await explicit approval before editing.
```

Do not edit files until the plan is clear.
