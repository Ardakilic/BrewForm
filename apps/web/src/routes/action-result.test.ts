import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors.ts';
import { formString, toActionFailure } from './action-result.ts';

describe('toActionFailure', () => {
  it('maps an API error to { ok: false, error, code }', () => {
    expect(toActionFailure(new ApiError('CONFLICT', 'Taken', undefined, 409))).toEqual({
      ok: false,
      error: 'Taken',
      code: 'CONFLICT',
    });
  });

  it('maps a plain error to { ok: false, error }', () => {
    expect(toActionFailure(new Error('offline'))).toEqual({ ok: false, error: 'offline' });
    expect(toActionFailure('weird')).toEqual({ ok: false, error: 'Request failed' });
  });

  it('rethrows a 401 (guard redirect) and aborts', () => {
    const unauthorized = new ApiError('UNAUTHORIZED', 'no', undefined, 401);
    expect(() => toActionFailure(unauthorized)).toThrow(unauthorized);
    const abort = new DOMException('aborted', 'AbortError');
    expect(() => toActionFailure(abort)).toThrow(abort);
  });

  it('rethrows extra statuses when asked (admin 403)', () => {
    const forbidden = new ApiError('FORBIDDEN', 'no', undefined, 403);
    expect(toActionFailure(forbidden)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(() => toActionFailure(forbidden, [401, 403])).toThrow(forbidden);
  });
});

describe('formString', () => {
  it('reads string fields and defaults to an empty string', () => {
    const form = new FormData();
    form.set('intent', 'ban');
    form.set('file', new Blob(['x']));
    expect(formString(form, 'intent')).toBe('ban');
    expect(formString(form, 'missing')).toBe('');
    expect(formString(form, 'file')).toBe('');
  });
});
