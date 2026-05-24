---
description: Structured refactoring workflow with smell detection, test verification, and safe execution
category: quality
aliases:
  - cleanup
---

Refactor the following:

$ARGUMENTS

Do not change behavior. The output of the code before and after must be identical for all inputs.

Process:

1. Use `code_search_batch` and `project_tree` to map the scope.
2. Identify the code smell or structural problem. Name it:
   - duplicate code, long method, large class, feature envy, data clump,
   - shotgun surgery, divergent change, primitive obsession, dead code,
   - inappropriate intimacy, message chain, speculative generality.
3. Check for existing tests covering the target code. If tests exist, run them before refactoring.
4. If no tests exist and the change is risky, write a characterization test first.
5. Plan the refactoring as a series of small, independently verifiable steps.
6. Execute one step at a time. Re-run tests after each step.
7. If any test fails after a step, revert that step and investigate.
8. Use `spawn_agents` with `reviewer` to verify the refactoring preserves behavior.

Output:

```text
Refactoring: {smell} in {scope}

Before:
- Structure: ...
- Issues: ...

Steps:
1. {step} - verified by {test or check}
2. ...

After:
- Structure: ...
- Behavior change: NONE

Test results:
- Before: ...
- After: ...

Remaining smells:
- ...
```

Do not combine refactoring with feature work. Refactoring is behavior-preserving only.
