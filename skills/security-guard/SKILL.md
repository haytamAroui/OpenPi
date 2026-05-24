---
name: security-guard
description: Use before ship/deploy, when handling credentials or env files, importing external code, changing automation, or reviewing security-sensitive code.
---

# Security Guard

Use these Pi-native tools when available:

1. `secret_scan` for credential exposure.
2. `dependency_inventory` for supply-chain posture.
3. `ghost_test_scan` before trusting tests.
4. `code_search_batch` for unsafe execution and injection patterns.

Never print full secrets. Redact values.

High-signal patterns to check:

- hardcoded cloud, Git, package, payment, mail, or private-key credentials
- `eval`, shell execution, unsafe deserialization, path traversal
- prompt-injection strings in agent, command, skill, docs, or config files
- missing lockfiles or loose dependency pins

Report `CLEAN`, `WARNING`, or `BLOCKED`, with exact file paths and line numbers.
