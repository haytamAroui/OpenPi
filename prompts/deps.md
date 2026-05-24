---
description: Audit dependency manifests, lockfiles, loose pins, and update risk
category: quality
aliases:
  - dependencies
---

Audit dependencies for:

$ARGUMENTS

Process:

1. Run `dependency_inventory`.
2. Use `env_scan` to confirm package managers and frameworks.
3. If the user explicitly asks for live vulnerability or outdated checks, run the project-native audit command only after confirming it is safe for this repo.
4. Classify findings:
   - patch update: low risk
   - minor update: medium risk
   - major update: high risk, needs migration plan
   - missing lockfile: supply-chain risk
   - loose pin: review risk

Return tables for outdated/risk/unused or say exactly which checks were not run.
