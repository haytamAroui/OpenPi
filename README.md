<div align="center">
  <h1>OpenPi</h1>
  <p><strong>A Pi-native command, skill, agent, workflow, and theme pack for serious coding sessions.</strong></p>
  <p>
    <a href="https://www.npmjs.com/package/@matyah00/openpi"><img src="https://img.shields.io/npm/v/@matyah00/openpi.svg" alt="npm version"></a>
    <a href="https://github.com/haytamAroui/OpenPi/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="license"></a>
    <a href="https://github.com/haytamAroui/OpenPi"><img src="https://img.shields.io/badge/Pi-native-111827" alt="Pi native"></a>
    <a href="https://www.npmjs.com/package/@matyah00/openpi"><img src="https://img.shields.io/badge/install-pi%20install%20npm%3A%40matyah00%2Fopenpi-0f766e" alt="Pi install"></a>
  </p>
  <p>
    <a href="#the-core-idea">Core Idea</a>
    <a href="#install">Install</a>
    <a href="#quick-start">Quick Start</a>
    <a href="#what-you-get">What You Get</a>
    <a href="#profiles">Profiles</a>
    <a href="#commands">Commands</a>
    <a href="#agent-workflows">Agents</a>
    <a href="#tooling">Tools</a>
    <a href="#architecture">Architecture</a>
  </p>
</div>

---

## The Core Idea

**OpenPi turns Pi into a richer engineering environment without copying another assistant's file layout.**

It uses Pi-owned package surfaces:

- `prompts/*.md` for slash-command prompt templates
- `skills/*/SKILL.md` for Pi skills
- `agents/*.md` for specialist role prompts
- `extensions/*.ts` for native Pi commands, tools, profile switching, themes, and workflow orchestration
- `themes/*.json` for terminal UI themes

```text
Plain Pi session                         OpenPi session

Manual project scan                      /prime and /explore orient the session
Ad hoc planning                          /spec, /clarify, /blueprint, /debate
One long assistant context               spawn_agents delegates to role agents
Manual grep/tree work                    project_tree and code_search_batch
Manual safety checks                     secret_scan, env_scan, ghost_test_scan
Lost session reasoning                   /snapshot, goal_state, write_snapshot
One profile for every task               /openpi use <profile>
```

OpenPi is not a project template. It is a reusable Pi package you install once and activate per project or globally.

---

## Install

```bash
npm i @matyah00/openpi
```

For Pi:

```bash
pi install npm:@matyah00/openpi
```

Restart Pi after install, then activate a profile:

```text
/openpi use full
/reload
```

The npm names `openpi` and `open-pi` are blocked by npm's package-name similarity policy, so the public npm package is:

```text
@matyah00/openpi
```

---

## Quick Start

```text
/openpi list                 show every profile
/openpi use commands         enable prompt commands and core tools
/openpi use workflow         enable /add, /fix, /review and spawn_agents
/openpi use guard            enable security, dependency, and ship gates
/openpi use commands+guard   combine multiple profiles (e.g. focus+safety)
/openpi use full --dry-run   preview profile settings changes without writing
/openpi use full             enable the broad OpenPi surface
/openpi clear                remove OpenPi-managed extensions
```

Use `--global` to install the selected profile into your global Pi settings:

```text
/openpi use full --global
```

Profiles update `.pi/settings.json`. Run `/reload` or restart Pi after switching.

---

## What You Get

```text
OpenPi
  13 profiles          choose or compose a focused runtime surface
  23 prompt commands   /prime, /blueprint, /deep, /ship, /refactor, ...
  42 agent prompts     planner, reviewer, tester, api-designer, Pi experts
  9 skills             ultrathink, test-first, refactor-guide, bowser, ...
  11 themes            tokyo-night, rose-pine, gruvbox, nord, dracula, ...
  Native tools         search, audit, state, snapshot, dispatch, chains
  Audit Telemetry      structured JSONL audit logging to .pi/logs/
```

OpenPi is designed around one practical rule: load only the surface you need.

| Need | Profile | What it adds |
|------|---------|--------------|
| Slash commands | `commands` | Prompt commands, search tools, state tools, theme switching |
| Explore a repo | `explore` | Tree/search/discovery workflows |
| Implement work | `workflow` | `/add`, `/fix`, `/review`, `spawn_agents` |
| Pre-ship safety | `guard` | Security, dependency, environment, and test-integrity tools |
| Focused UI | `focus` | Minimal Pi UI plus theme defaults |
| Session purpose | `purpose` | Keeps task purpose visible while working |
| Metrics | `metrics` | Model, context, branch, token, cost, and tool counters |
| Personas | `system` | Switch active system persona from bundled agents |
| Teams | `team` | Dispatcher-only role team with `dispatch_agent` |
| Chains | `chain` | Sequential workflow runner with `run_chain` |
| Everything | `full` | Commands, workflow, safety, metrics, personas, teams, chains |

---

## Commands

OpenPi prompt commands are markdown templates with frontmatter metadata. They are loaded from the package and can be extended by project-local `.pi/prompts/*.md`.

### Planning and reasoning

| Command | Purpose |
|---------|---------|
| `/prime` | Load project orientation before work |
| `/spec` | Turn a vague feature into a structured spec |
| `/clarify` | Ask focused clarification questions before coding |
| `/blueprint` | Build an implementation blueprint before risky work |
| `/debate` | Run adversarial decision analysis for tradeoffs |
| `/deep` | Use deeper evidence-led reasoning for hard bugs or architecture |
| `/plan-team` | Create a team-oriented implementation plan |

### Discovery and state

| Command | Purpose |
|---------|---------|
| `/explore` | Map relevant files and code paths |
| `/goal` | Manage durable task goals in `.pi/memory/goals.md` |
| `/snapshot` | Save a continuation checkpoint before compaction |
| `/compress` | Compress current task context into a handoff brief |
| `/commands` | List loaded OpenPi and project prompt commands |
| `/command:status` | Show command loader status and collisions |

### Quality and release

| Command | Purpose |
|---------|---------|
| `/code-review` | Review code or changes for bugs and missing tests |
| `/test` | Select or design focused validation |
| `/validate` | Run targeted validation for current work |
| `/deps` | Audit dependency manifests, lockfiles, pins, and update risk |
| `/ghost-test` | Detect vacuous tests and reward-hacking test patterns |
| `/sentinel` | Read-only security and environment safety scan |
| `/ship` | Pre-ship gate for tests, security, dependency risk, and git readiness |
| `/parallel` | Plan safe parallel work with ownership checks |

---

## Agent Workflows

The `workflow` profile adds high-level commands that prompt Pi to use role agents and verification steps.

```text
/add <feature>       discover files -> plan -> edit -> test -> review
/fix <bug>           reproduce/inspect -> plan -> patch -> validate -> review
/review [scope]      read-only review over diff or requested scope
/openpi-agents       list available role agents
```

OpenPi role agents include:

| Agent | Role |
|-------|------|
| `file-picker` | Finds relevant files and line ranges before edits |
| `planner` | Produces scoped implementation plans |
| `editor` | Performs isolated edits when the plan is clear |
| `tester` | Selects and runs targeted validation |
| `reviewer` | Reviews diffs for bugs, regressions, and missing tests |
| `security-auditor` | Checks secrets, risky automation, and security-sensitive changes |
| `problem-architect` | Turns ambiguous work into a concrete team spec |
| `spec-reviewer` | Challenges unclear requirements before implementation |
| `ship-guard` | Reviews release readiness |
| `red-team` | Challenges plans and assumptions |
| `api-designer` | Reviews REST/GraphQL APIs for design and naming consistency |
| `perf-auditor` | Evaluates bundle sizes, N+1 queries, and resource leaks |
| `migration-expert` | Plans database and architecture migration sequences |
| `docs-writer` | Generates/maintains READMEs, manuals, and architecture documents |

The `spawn_agents` tool can run agents sequentially or in parallel as isolated Pi subprocesses. It returns structured outputs: files, line ranges, commands, exact validation output, findings, and assumptions.

---

## Team and Chain Modes

OpenPi has two orchestration modes for larger work.

### Team dispatcher

```text
/openpi use team
/agents-list
/agents-team guard
```

The `team` profile registers `dispatch_agent` and uses teams from `agents/teams.yaml`, including:

| Team | Agents |
|------|--------|
| `research` | scout, directory-lister, glob-matcher, code-searcher, librarian, documenter, red-team |
| `validation` | tester, basher, reviewer |
| `guard` | security-auditor, rule-verifier, ship-guard, spec-reviewer |
| `frontend` | scout, frontend, reviewer |
| `backend` | scout, backend, reviewer |
| `pi-pi` | Pi package, extension, skill, prompt, config, theme, TUI, CLI, and keybinding experts |
| `perf` | scout, perf-auditor, planner, reviewer |
| `docs` | scout, docs-writer, reviewer |
| `api` | scout, api-designer, reviewer |
| `migration` | scout, migration-expert, planner, reviewer |

### Chain runner

```text
/openpi use chain
/chain-list
```

The `chain` profile registers `run_chain` for sequential workflows from `agents/agent-chain.yaml`:

| Chain | Flow |
|-------|------|
| `plan-build-review` | planner -> builder -> reviewer |
| `research-plan` | scout -> red-team -> planner |
| `deep-explore` | directory-lister -> code-searcher -> thinker |
| `evidence-validate` | code-searcher -> tester -> reviewer |
| `spec-to-plan` | problem-architect -> spec-reviewer -> planner |
| `ship-gate` | security-auditor -> ship-guard -> reviewer |
| `pi-package-design` | Pi experts -> planner |
| `refactor-flow` | scout -> problem-architect -> planner -> reviewer |
| `docs-flow` | scout -> docs-writer -> reviewer |
| `perf-audit` | scout -> perf-auditor -> planner |
| `full-lifecycle` | problem-architect -> planner -> plan-reviewer -> builder -> tester -> reviewer |

---

## Tooling

OpenPi registers native Pi tools through profiles.

| Tool | Purpose |
|------|---------|
| `project_tree` | Return a scoped project tree with ignore handling (supports file sizes) |
| `code_search_batch` | Run multiple code searches in one call (supports case-sensitivity & regex toggle) |
| `env_scan` | Detect stack, package managers, scripts, and environment clues (24+ frameworks) |
| `secret_scan` | Search for 22 types of cloud keys, tokens, credentials, and high-entropy hex strings |
| `ghost_test_scan` | Find weak, empty, mocked-everything, self-comparing, or reward-hacked tests |
| `sast_scan` | Static Application Security Testing for eval, SQL concat, SSRF, CORS wildcards, and XSS |
| `dependency_inventory` | Summarize dependency manifests and lockfiles |
| `session_state` | Read current session state |
| `goal_state` | Read goal memory state |
| `write_snapshot` | Write a continuation snapshot |
| `parallel_safety_check` | Check file ownership overlap before parallel work |
| `spawn_agents` | Run role agents as isolated Pi subprocesses (supports retries & timeouts) |
| `dispatch_agent` | Dispatch to the active specialist team |
| `run_chain` | Run a named sequential agent chain (supports step timeouts, continueOnError, & $STEP_N) |

---

## Skills

OpenPi ships focused Pi skills:

| Skill | Use it for |
|-------|------------|
| `ultrathink` | Hard debugging, architecture tradeoffs, root-cause analysis |
| `test-first` | Production code, bug fixes, refactors, validation planning |
| `security-guard` | Credentials, env files, external code, automation, deploy risk |
| `spec-driven` | Vague requirements, unclear features, acceptance criteria |
| `session-continuity` | Long context, resuming, stopping, compaction handoffs |
| `env-scanner` | Unknown repos, setup issues, stack detection |
| `bowser` | Playwright-powered browser automation and UI testing |
| `refactor-guide` | Guides safe codebase refactoring with code smell detection and verification |
| `perf-auditor` | Structured resource profiling and runtime execution optimization |

---

## Themes and UI Profiles

OpenPi includes 11 bundled themes:

```text
catppuccin-mocha  cyberpunk  dracula  everforest  gruvbox
midnight-ocean    nord       ocean-breeze  rose-pine
synthwave         tokyo-night
```

Use the theme profile or the `full` profile, then:

```text
/theme
/theme tokyo-night
```

UI-oriented profiles:

| Profile | Purpose |
|---------|---------|
| `focus` | Minimal, distraction-free Pi UI |
| `metrics` | Status bar and usage metrics |
| `tool-widget` | Live per-tool usage counts |
| `purpose` | Session purpose gate and visible task focus |
| `safety` | Damage-control rules and actionable blocked-tool feedback |

---

## Architecture

OpenPi is a package, not a project scaffold.

```text
@matyah00/openpi
  package.json              Pi package manifest
  prompts/                  prompt commands
  skills/                   Pi skills
  agents/                   role agents, teams, chains
  extensions/               native Pi extensions and tools
  themes/                   terminal UI themes
  damage-control-rules.yaml safety feedback rules
```

The activation flow is explicit:

```text
1. Install package with Pi
2. Run /openpi use <profile>
3. OpenPi writes selected extension paths into .pi/settings.json
4. Run /reload or restart Pi
5. Use only the commands/tools for that profile
```

This keeps OpenPi portable across projects. You can add project-specific prompts and agents in `.pi/prompts` and `.pi/agents`; OpenPi will load them alongside the bundled resources where the active profile supports it.

---

## Why It Is Different

| Without OpenPi | With OpenPi |
|----------------|-------------|
| One generic assistant flow | Profiles for planning, workflow, guard, team, chain, UI |
| Manual project discovery | `/explore`, `project_tree`, `code_search_batch` |
| Vague implementation prompts | `/spec`, `/clarify`, `/blueprint`, `problem-architect` |
| Manual review discipline | `/review`, `reviewer`, `ship-guard`, `ghost_test_scan` |
| One large context | `spawn_agents`, `dispatch_agent`, `run_chain` |
| Repeated session loss | `/snapshot`, `write_snapshot`, `goal_state` |
| Ad hoc security checks | `secret_scan`, `/sentinel`, `security-guard` |
| Same UI for every task | focus, metrics, purpose, tool-widget, safety profiles |

---

## Verified

Before publish, the package is checked with:

```bash
npm pack --dry-run
npx tsc --noEmit
npm install @matyah00/openpi@latest --dry-run
```

Current npm package:

```bash
npm i @matyah00/openpi
pi install npm:@matyah00/openpi
```

---

## License

MIT - [haytamAroui](https://github.com/haytamAroui)
