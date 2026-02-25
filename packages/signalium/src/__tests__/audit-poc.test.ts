import { beforeEach, describe, expect, test } from 'vitest';
import { clearGlobalContexts, reactive } from '../index.js';
import { DERIVED_DEFINITION_MAP } from '../internals/core-api.js';
import { getGlobalScope } from '../internals/contexts.js';

const getSignalsMap = () => {
  return (getGlobalScope() as any).signals as Map<number, unknown>;
};

describe('audit PoCs', () => {
  beforeEach(() => {
    clearGlobalContexts();
    DERIVED_DEFINITION_MAP.clear();
  });

  test('POC: reactive() reuses first opts for same function identity', () => {
    const fn = (n: number) => n;

    const first = reactive(fn, { paramKey: n => n % 2 });
    const second = reactive(fn, { paramKey: n => n });

    // Same function identity returns the original reactive function/definition.
    expect(second).toBe(first);

    expect(first(1)).toBe(1);

    // If second opts were respected (paramKey: n => n), this would compute to 3.
    // Instead it reuses first opts (paramKey: parity), so it reads cached value for odd bucket.
    expect(second(3)).toBe(1);
    expect(second(5)).toBe(1);

    expect(getSignalsMap().size).toBe(1);
  });

  test('POC: falsy paramKey values are treated as missing', () => {
    const grouped = reactive((n: number) => n, { paramKey: () => 0 });

    grouped(1);
    grouped(2);

    // With paramKey respected, both calls would share one cached signal.
    // Current truthy check falls back to args and creates two entries.
    expect(getSignalsMap().size).toBe(2);
  });
});
