---
name: test-first
description: Use before implementing production code, fixing bugs, refactoring, or when asked about tests, coverage, validation, or TDD.
---

# Test First

TDD is opt-in. Check both:

1. The project has a written test-first rule.
2. Existing tests are present.

If both are true:

1. Write the failing test first.
2. Run it and confirm it fails for the right reason.
3. Implement the smallest change.
4. Re-run and confirm green.
5. Refactor only after green.

If either signal is missing, suggest a targeted test but do not block implementation.

Before trusting green tests, use `ghost_test_scan` for static test-integrity checks when the change is important.
