---
description: Read-only security and environment safety scan
category: security
aliases:
  - security-scan
---

Run a read-only safety scan for:

$ARGUMENTS

Process:

1. Run `secret_scan`.
2. Run `dependency_inventory`.
3. Run `ghost_test_scan` if test trust matters.
4. Use `code_search_batch` for high-risk patterns:
   - `eval(`
   - `child_process.exec`
   - `shell=True`
   - `dangerouslySetInnerHTML`
   - `pickle.load`
   - `yaml.load`
   - `ignore previous instructions`
5. Use `spawn_agents` with `security-auditor` for a full read-only review when available.

Never print full secret values. Redact findings.

Return score, blocking findings, high/medium/low findings, and required fixes before ship.
