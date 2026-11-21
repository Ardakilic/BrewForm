import { t as translate } from '@brewform/shared/i18n';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/errors.ts';
import { getApiErrorMessage, isRateLimitedError } from './apiErrorMessage.ts';

const en = (key: string) => translate(key, 'en');
const tr = (key: string) => translate(key, 'tr');

describe('getApiErrorMessage', () => {
  it('localises a rate-limited error with the Retry-After seconds', () => {
    const err = new ApiError('RATE_LIMITED', 'Too many login attempts', undefined, 429, 120);
    expect(getApiErrorMessage(err, en, 'auth.login.error.failed')).toBe(
      'Too many attempts. Please try again in 120 seconds.',
    );
    expect(getApiErrorMessage(err, tr, 'auth.login.error.failed')).toBe(
      'Çok fazla deneme yapıldı. Lütfen 120 saniye sonra tekrar deneyin.',
    );
  });

  it('falls back to 60 seconds when Retry-After was missing', () => {
    const err = new ApiError('RATE_LIMITED', 'Too many requests', undefined, 429);
    expect(getApiErrorMessage(err, en, 'error.500')).toBe(
      'Too many attempts. Please try again in 60 seconds.',
    );
  });

  it('uses the error message for other errors', () => {
    const err = new ApiError('INVALID_CREDENTIALS', 'Invalid email or password', undefined, 401);
    expect(getApiErrorMessage(err, en, 'auth.login.error.failed')).toBe(
      'Invalid email or password',
    );
    expect(getApiErrorMessage(new Error('Network error'), en, 'error.500')).toBe('Network error');
  });

  it('uses the fallback key when there is no message', () => {
    expect(getApiErrorMessage('boom', en, 'error.500')).toBe(en('error.500'));
    expect(getApiErrorMessage(new Error(''), en, 'error.500')).toBe(en('error.500'));
  });
});

describe('isRateLimitedError', () => {
  it('matches only RATE_LIMITED ApiErrors', () => {
    expect(isRateLimitedError(new ApiError('RATE_LIMITED', 'x', undefined, 429))).toBe(true);
    expect(isRateLimitedError(new ApiError('NOT_FOUND', 'x', undefined, 404))).toBe(false);
    expect(isRateLimitedError(new Error('RATE_LIMITED'))).toBe(false);
  });
});
