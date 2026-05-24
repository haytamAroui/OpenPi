---
description: Resolve ambiguity before planning or coding
category: planning
aliases:
  - clear
---

Clarify this request before planning or implementation:

$ARGUMENTS

Work in read-only mode. Do not edit files.

Process:

1. Identify the goal, user, success state, and what is already specified.
2. Use `env_scan`, `project_tree`, or `code_search_batch` only if project context is needed to ask better questions.
3. Ask at most five unresolved questions, grouped by:
   - goal
   - scope boundary
   - acceptance criteria
   - failure modes
   - constraints
4. Do not ask implementation-detail questions unless they change user-visible behavior.

Return a concise clarification brief with draft acceptance criteria and explicit open questions.
