import type { ShouldRevalidateFunctionArgs } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/logger.ts', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  }),
}));

import { shouldRevalidate } from './RecipeDetailPage.data.ts';

/** Builds `shouldRevalidate` arguments for a submission to `formAction`. */
function args(
  formAction: string | undefined,
  actionResult: unknown,
  defaultShouldRevalidate = true,
): ShouldRevalidateFunctionArgs {
  const url = new URL('http://localhost/recipes/my-espresso');
  return {
    currentUrl: url,
    nextUrl: url,
    currentParams: { slug: 'my-espresso' },
    nextParams: { slug: 'my-espresso' },
    formMethod: formAction ? 'POST' : undefined,
    formAction,
    actionResult,
    defaultShouldRevalidate,
  };
}

describe('RecipeDetailPage shouldRevalidate', () => {
  it.each([
    '/recipes/recipe-1/like',
    '/recipes/recipe-1/favourite',
    '/follow/user-1',
    '/comments/recipe/recipe-1',
    '/comments/comment-1',
  ])('skips the detail loader after a successful %s action', (formAction) => {
    expect(shouldRevalidate(args(formAction, { ok: true }))).toBe(false);
  });

  it('revalidates after a failed social action', () => {
    expect(shouldRevalidate(args('/recipes/recipe-1/like', { ok: false, error: 'x' }))).toBe(true);
  });

  it('revalidates after a rating (the community average comes from the loader)', () => {
    expect(shouldRevalidate(args('/recipes/recipe-1/rate', { ok: true }))).toBe(true);
  });

  it('defers to the default for navigations and other actions', () => {
    expect(shouldRevalidate(args(undefined, undefined))).toBe(true);
    expect(shouldRevalidate(args(undefined, undefined, false))).toBe(false);
    expect(shouldRevalidate(args('/collections/c1', { ok: true }))).toBe(true);
  });
});
