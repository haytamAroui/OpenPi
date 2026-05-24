---
description: Check test integrity for reward-hacking and vacuous pass patterns
category: quality
aliases:
  - test-integrity
---

Check test integrity for:

$ARGUMENTS

Process:

1. Run `ghost_test_scan`.
2. Inspect any suspicious files before drawing conclusions.
3. If the user asks for a canary test, explain the exact temporary test file and command first; do not leave the canary file behind.
4. Classify verdict:
   - CLEAN: no static reward-hack patterns found
   - SUSPICIOUS: static patterns found, needs inspection
   - COMPROMISED: a canary that must fail unexpectedly passes

Report exact file:line findings and the verification commands used.
