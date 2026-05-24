---
description: Performance audit with bottleneck identification and improvement prioritization
category: quality
aliases:
  - performance
---

Run a performance audit for:

$ARGUMENTS

Process:

1. Use `env_scan` to identify the stack and build tooling.
2. Use `project_tree` to understand project structure and identify hot paths.
3. Use `code_search_batch` for known performance anti-patterns:
   - N+1 queries, missing indexes, synchronous I/O in async code
   - Large bundle imports, missing tree-shaking, barrel re-exports
   - Missing memoization, inline closures in render, unstable keys
   - O(n²) loops, repeated serialization, missing caching
4. Use `spawn_agents` with `perf-auditor` for in-depth analysis when useful.
5. Categorize findings by impact and effort.

Output:

```text
Performance Audit: {scope}

Risk Level: low | medium | high | critical

Quick Wins (< 1 hour):
1. file:line - issue - estimated improvement

Medium Effort (1-4 hours):
1. file:line - issue - estimated improvement

Architecture Changes:
1. description - estimated improvement - effort

Bundle Analysis:
- Total: ...
- Largest deps: ...

Query Analysis:
- Hot paths: ...
- N+1 patterns: ...

Recommendations:
1. ...
```

Do not optimize prematurely. Focus on measured or evidenced bottlenecks.
