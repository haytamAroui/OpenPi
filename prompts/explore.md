---
description: Map relevant files and code paths before implementation
category: discovery
aliases:
  - x
---

Explore the project for this task:

$ARGUMENTS

Use Pi-native discovery:

1. Use `project_tree` for a compact structure map if the relevant area is unclear.
2. Use `code_search_batch` for symbols, routes, config keys, errors, and user-facing strings.
3. Use `spawn_agents` when useful:
   - `directory-lister` for repository shape
   - `glob-matcher` for file pattern discovery
   - `code-searcher` for exact search evidence
   - `librarian` for source-grounded explanation

Return relevant files, line references, tests to run, and what remains unknown. Do not edit files.
