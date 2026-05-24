---
name: perf-auditor
description: Use when diagnosing performance issues, optimizing bundle size, fixing slow queries, reducing memory usage, or auditing hot paths.
---

# Performance Auditor

Focus on measured or evidenced bottlenecks. Do not optimize prematurely.

## Frontend Performance

Check for:
- Large bundle imports (`import _ from 'lodash'` instead of `import get from 'lodash/get'`)
- Barrel file re-exports that prevent tree-shaking
- Missing `React.memo`, `useMemo`, `useCallback` on expensive renders
- Inline object/function props causing unnecessary re-renders
- Unoptimized images, missing lazy loading
- Blocking synchronous scripts in `<head>`
- Layout thrashing from synchronous DOM read/write cycles

## Backend Performance

Check for:
- N+1 query patterns in ORM usage (loop with `.find()` or `.get()`)
- Missing database indexes on filtered/sorted columns
- Synchronous file I/O in async request handlers
- Unclosed database connections or missing connection pooling
- CPU-bound work blocking the event loop
- Unbounded in-memory caches
- Missing pagination on list endpoints

## General

Check for:
- O(n²) or worse algorithmic complexity in hot paths
- Repeated JSON serialization/deserialization
- Missing HTTP caching headers
- Unnecessary network roundtrips
- Cold start overhead from eager loading

## Tools

Use `code_search_batch` with patterns:
- `\.find\(`, `\.findOne\(`, `\.get\(` inside loops for N+1
- `import .* from ['"]lodash['"]` for barrel imports
- `fs\.readFileSync`, `fs\.writeFileSync` for sync I/O
- `JSON\.parse.*JSON\.stringify` for repeated serialization

Report findings with `file:line`, estimated impact, and effort to fix.
