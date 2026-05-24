---
name: spec-driven
description: Use when a request is vague, requirements are unclear, or a feature should be specified before planning or coding.
---

# Spec Driven Workflow

Use this order:

1. `/clarify` if behavior, scope, acceptance criteria, or failure modes are unclear.
2. `/spec` to write the requirements contract.
3. `spec-reviewer` to gate the spec.
4. `/blueprint` or `/deep` to plan implementation.
5. `/add` or `/fix` to implement.
6. `/validate` and `/ship` before completion.

A good spec has:

- one clear goal
- at least two user stories
- at least three testable acceptance criteria
- explicit out-of-scope items
- failure modes
- constraints
- no unresolved blocking questions
