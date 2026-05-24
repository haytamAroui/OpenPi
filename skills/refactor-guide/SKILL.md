---
name: refactor-guide
description: Use when refactoring code, cleaning up technical debt, removing code smells, extracting modules, or restructuring without changing behavior.
---

# Refactor Guide

Refactoring preserves behavior. Never combine refactoring with feature work.

## Before Refactoring

1. Identify the code smell by name:
   - Duplicate code, long method, large class, feature envy, data clump,
   - shotgun surgery, divergent change, primitive obsession, dead code,
   - inappropriate intimacy, message chain, speculative generality.
2. Find existing tests covering the target. Run them. They must pass.
3. If no tests exist and the change is risky, write a characterization test first.

## During Refactoring

1. Plan as a series of small, independently verifiable steps.
2. Execute one step at a time.
3. Re-run relevant tests after each step.
4. If any test fails, revert that step and investigate.
5. Do not refactor and add features in the same change.

## After Refactoring

1. Run the full relevant test suite.
2. Use `ghost_test_scan` before trusting green tests.
3. Verify no behavior change with concrete before/after evidence.
4. Use `spawn_agents` with `reviewer` to validate the diff preserves behavior.

## Anti-Patterns to Avoid

- Refactoring without tests as a safety net.
- "While I'm in here" feature additions.
- Speculative abstraction (don't extract what you don't need yet).
- Renaming for style without consensus.
