---
name: env-scanner
description: Use when entering an unfamiliar project, diagnosing setup/build issues, detecting stack, package managers, frameworks, git state, or project structure.
---

# Env Scanner

Use the Pi-native `env_scan` tool first.

It reports:

- working directory
- git branch and status
- detected frameworks
- dependency manifests and lockfiles
- top-level project structure

Fallback if the tool is unavailable:

1. List the project root.
2. Check `package.json`, `pyproject.toml`, `requirements.txt`, `Cargo.toml`, `go.mod`, and `Dockerfile`.
3. Check `git status --short` and current branch.
4. Read the first part of `README.md` if present.

Keep the output compact and evidence-based.
