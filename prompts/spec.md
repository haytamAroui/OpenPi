---
description: Write a structured feature spec before planning or coding
category: planning
aliases:
  - requirements
---

Write a structured spec for:

$ARGUMENTS

Use source-grounded context only where helpful:

1. Run `env_scan` for stack context if this is a codebase task.
2. Use `code_search_batch` to find related existing behavior.
3. If requirements are vague, switch to `/clarify` behavior first.
4. Use `spawn_agents` with `spec-reviewer` for the final gate when available.

Spec format:

```markdown
# Spec: {feature title}
status: draft | ready-for-plan

## Goal
{who uses this, what problem it solves, and why now}

## User Stories
- As a {user}, I want {action} so that {outcome}

## Acceptance Criteria
1. Given {precondition}, when {action}, then {expected outcome}
2. Given {precondition}, when {action}, then {expected outcome}
3. Given {precondition}, when {action}, then {expected outcome}

## Data Model Changes
{changes or "none"}

## API / Interface Changes
{changes or "none"}

## Out of Scope
- {explicit exclusion}

## Failure Modes
| Scenario | Expected behavior |
| --- | --- |

## Constraints
- Security:
- Performance:
- Compatibility:

## Open Questions
- [ ] {question or "none"}
```

Do not write implementation code.
