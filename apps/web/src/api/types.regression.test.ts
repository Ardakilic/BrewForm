import { describe, expect, it } from 'vitest';
import type { RecipeDetailOutput } from '@brewform/shared/schemas';

/**
 * Type-level regression test: locks that `RecipeDetailOutput` is a real,
 * restrictive type (not `any` in disguise). If someone accidentally widens
 * the type to `any` or adds a phantom field, the `@ts-expect-error` below
 * fires (tsc --noEmit fails). The runtime `it` only exists so vitest
 * collects the file — the real assertion is compile-time.
 */

// @ts-expect-error — nonExistentField does not exist on RecipeDetailOutput
const _test: RecipeDetailOutput['nonExistentField'] = null;

describe('types.regression', () => {
  it('RecipeDetailOutput is a restrictive type (compile-time @ts-expect-error above)', () => {
    expect(_test).toBeNull();
  });
});
