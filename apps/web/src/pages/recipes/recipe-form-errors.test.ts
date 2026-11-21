import { describe, expect, it } from 'vitest';
import { recipeFormErrorMessage } from './recipe-form-errors.ts';

/** Translator stub: returns the key wrapped so tests can tell it apart from API text. */
const t = (key: string) => (key === 'error.rateLimited' ? 'Wait {seconds}s' : `[${key}]`);

describe('recipeFormErrorMessage', () => {
  it('lists one line per validation detail, optionally bulleted', () => {
    const failure = {
      error: 'Invalid',
      code: 'VALIDATION_ERROR',
      details: [
        { field: 'title', message: 'Required' },
        { field: 'rating', message: 'Too high' },
      ],
    };
    expect(recipeFormErrorMessage(failure, t, 'fallback')).toBe(
      'title: Required\nrating: Too high',
    );
    expect(recipeFormErrorMessage(failure, t, 'fallback', true)).toBe(
      '• title: Required\n• rating: Too high',
    );
  });

  it('shows the API message, the rate-limit text, or the fallback key', () => {
    expect(recipeFormErrorMessage({ error: 'Network down' }, t, 'fallback')).toBe('Network down');
    expect(
      recipeFormErrorMessage(
        { error: 'slow down', code: 'RATE_LIMITED', retryAfterSeconds: 7 },
        t,
        'fallback',
      ),
    ).toBe('Wait 7s');
    expect(recipeFormErrorMessage({ error: '' }, t, 'recipe.fork.forkError')).toBe(
      '[recipe.fork.forkError]',
    );
  });
});
