# openpi

Pi-native package for reusable commands, skills, agents, and workflows.

This package uses Pi-owned paths only:

- `prompts/*.md` for slash-command prompt templates
- `skills/*/SKILL.md` for Pi skills
- `agents/*.md` for system prompts and specialist agents
- `agents/teams.yaml` for multi-agent dispatcher teams
- `agents/agent-chain.yaml` for sequential workflows

## Install

```bash
npm i @matyah00/openpi
```

For Pi:

```bash
pi install npm:@matyah00/openpi
```

Restart Pi after install.

The unscoped npm name `openpi` is blocked by npm's package-name similarity
policy because it is too close to `open`, `opener`, and `openai`. GitHub
repository ownership does not reserve the npm package name.

## Profiles

Use `/openpi` to list available profiles.

```text
/openpi use commands
/openpi use explore
/openpi use guard
/openpi use workflow
/openpi use system
/openpi use team
/openpi use chain
/openpi use full
/openpi clear
```

Profiles write selected extension paths into the current project's `.pi/settings.json`.
Run `/reload` or restart Pi after changing profiles.

## Commands

When the `commands` profile is active:

```text
/prime
/blueprint
/code-review
/explore
/deep
/compress
/goal
/snapshot
/parallel
/validate
/clarify
/spec
/debate
/deps
/ghost-test
/sentinel
/ship
/commands
/command:status
```

The `commands`, `explore`, `workflow`, and `full` profiles also register:

```text
project_tree
code_search_batch
env_scan
secret_scan
ghost_test_scan
dependency_inventory
session_state
goal_state
write_snapshot
parallel_safety_check
```

When the `workflow` profile is active:

```text
/add <feature>
/fix <bug>
/review [scope]
/openpi-agents
```

The workflow profile also registers the `spawn_agents` tool for isolated role-agent
delegation through `file-picker`, `planner`, `editor`, `worker`, `tester`, and
`reviewer` agents. The extended discovery roles include `code-searcher`,
`directory-lister`, `glob-matcher`, `basher`, `thinker`, `context-pruner`, and
`librarian`.

The `guard` profile adds pre-ship and governance workflows inspired by mature
agent environments: spec gates, dependency inventory, secret scanning, test
integrity checks, and ship readiness.

## Agents

When the `system` profile is active, use `/system` to select a persona.

When the `team` profile is active, the main agent becomes a dispatcher and can only use
`dispatch_agent` to delegate work to the selected team.

When the `chain` profile is active, use `run_chain` for sequential workflows.
