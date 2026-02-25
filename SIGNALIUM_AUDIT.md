# Signalium Audit (State Management Readiness)

## Scope

- Reviewed `packages/signalium/src` with focus on runtime reactivity, caching, scope/context behavior, and React integration.
- Re-validated each finding in this document directly against source.
- Ran unit tests: `npm run -w signalium test:unit` (17 files, 394 tests passing).
- React/browser tests were not executed in this environment (Playwright browser binaries unavailable).

## Validation Summary

| #   | Original Severity | Validation                                          | Updated Severity |
| --- | ----------------- | --------------------------------------------------- | ---------------- |
| 1   | Critical          | Confirmed                                           | Critical         |
| 2   | High              | Confirmed                                           | High             |
| 3   | High              | Confirmed                                           | High             |
| 4   | High              | Confirmed risk; partly cache-policy/design tradeoff | Medium           |

## Findings

### 1) Critical (Confirmed): `reactive()` cache is keyed only by function identity; later options and initial fallback scope are ignored

- Evidence:
  - `DERIVED_DEFINITION_MAP` is keyed only by `fn`: `packages/signalium/src/internals/core-api.ts:22`
  - Existing entry is returned without re-checking `opts`: `packages/signalium/src/internals/core-api.ts:28-31,47`
  - Fallback scope is captured at first creation and reused: `packages/signalium/src/internals/core-api.ts:33-37`
- Why this is risky:
  - `reactive(fn, optsA)` then `reactive(fn, optsB)` keeps `optsA` semantics (`equals`, `paramKey`, ids/descriptions).
  - First call site scope can become fallback for later call sites, creating cross-boundary behavior surprises.
- Recommendation:
  - Include options/scope identity in cache semantics, or avoid global memoization by raw function identity.
  - At minimum, detect conflicting options for the same `fn` and throw in dev mode.

### 2) High (Confirmed): strong `Map` for derived definitions can permanently retain function objects and captured closures

- Evidence:
  - Global strong map: `packages/signalium/src/internals/core-api.ts:22`
  - Entries are added and never deleted: `packages/signalium/src/internals/core-api.ts:44,68`
- Why this is risky:
  - Dynamic/reactive creation patterns that generate fresh function identities will accumulate entries.
  - In long-lived processes this creates unbounded retention pressure.
- Recommendation:
  - Use `WeakMap` for function-keyed cache storage when possible.
  - Document/guard against dynamic `reactive(() => ...)` creation patterns that bypass stable reuse.

### 3) High (Confirmed): falsy `paramKey` handling breaks key semantics and GC reinsertion edge cases

- Evidence:
  - `paramKey` path uses truthiness (`paramKey ? ... : args`) instead of undefined check: `packages/signalium/src/internals/contexts.ts:105-106`
  - GC reinsertion uses `if (key)` instead of `key !== undefined`: `packages/signalium/src/internals/contexts.ts:127-131`
- Why this is risky:
  - Valid keys like `0` and `''` are treated as if no key was provided.
  - Signals keyed by falsy values may not be reinserted correctly after unwatch/re-watch flows.
- Recommendation:
  - Use explicit undefined checks:
    - `paramKey !== undefined ? [paramKey] : args`
    - `if (key !== undefined) { ... }`

### 4) Medium (Confirmed Risk): parameterized reactive cache has no eviction path for non-watched entries

- Evidence:
  - New signals are always cached in scope map: `packages/signalium/src/internals/contexts.ts:109-112`
  - GC candidates are only added via unwatch transitions: `packages/signalium/src/internals/watch.ts:45-47`
- Why this is risky:
  - High-cardinality argument usage outside watcher lifecycles can grow cache indefinitely.
  - This is especially relevant for server/background code paths with many unique parameter combinations.
- Nuance:
  - Some persistence is intentional (memoization behavior), so this is both a legitimate risk and a policy decision.
- Recommendation:
  - Add cache lifecycle controls (TTL/LRU/manual invalidation), or introduce stale-entry pruning for non-watched keys.
