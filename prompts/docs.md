---
description: Generate or update documentation with gap detection and review
category: quality
aliases:
  - document
---

Generate or update documentation for:

$ARGUMENTS

Process:

1. Use `project_tree` to map the project structure.
2. Use `code_search_batch` to find exports, public APIs, route definitions, and type declarations.
3. Identify documentation gaps:
   - Missing README sections (setup, usage, API, contributing)
   - Undocumented public functions, classes, or endpoints
   - Stale documentation that doesn't match current code
   - Missing architecture or design decision records
4. Use `spawn_agents` with `docs-writer` for detailed documentation generation when useful.
5. Use `spawn_agents` with `reviewer` to validate accuracy of generated docs.

Rules:

- Match existing documentation style and conventions.
- Include working code examples.
- Document error cases and edge cases.
- Use concrete language, not abstract descriptions.
- Link between related sections.
- Include prerequisites and setup steps.

Output:

- Generated or updated documentation files.
- List of remaining documentation gaps.
- Review verdict on documentation accuracy.
