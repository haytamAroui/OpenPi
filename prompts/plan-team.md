---
description: Create a team-oriented implementation plan using Pi-native agents
category: planning
aliases:
  - plan-team
  - team-plan
---

Create a planning-only implementation blueprint for:

$ARGUMENTS

Use the Pi-native team model:

- Available specialist roles live in `agents/*.md`.
- Team sets live in `agents/teams.yaml`.
- Sequential workflows live in `agents/agent-chain.yaml`.
- The dispatcher can use `dispatch_agent`.
- The chain runner can use `run_chain`.

Plan format:

1. Task type and complexity.
2. Relevant files and source-truth checks.
3. Recommended team or chain.
4. Step-by-step tasks with dependencies.
5. Agent assignment per task.
6. Verification commands.
7. Risks and fallback plan.

Planning only. Do not implement until the plan is accepted.
