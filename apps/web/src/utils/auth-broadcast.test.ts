import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_CHANGE_KEY, broadcastAuthChange, readAuthChange } from './auth-broadcast.ts';

/** A `storage` event for `key` with `newValue`. */
function storageEvent(key: string | null, newValue: string | null): StorageEvent {
  return new StorageEvent('storage', { key, newValue });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('broadcastAuthChange', () => {
  it('writes <change>:<digits> under the auth-change key', () => {
    broadcastAuthChange('logout');

    expect(localStorage.getItem(AUTH_CHANGE_KEY)).toMatch(/^logout:\d+$/);
  });

  it('writes a different value on every call, so the event always fires', () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValueOnce(1000).mockReturnValueOnce(1001);

    broadcastAuthChange('login');
    const first = localStorage.getItem(AUTH_CHANGE_KEY);
    broadcastAuthChange('login');
    const second = localStorage.getItem(AUTH_CHANGE_KEY);

    expect(first).toBe('login:1000');
    expect(second).toBe('login:1001');
  });

  it('swallows a throwing setItem (private mode, quota)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    expect(() => broadcastAuthChange('logout')).not.toThrow();
  });
});

describe('readAuthChange', () => {
  it.each([
    ['logout:123', 'logout'],
    ['login:4', 'login'],
  ] as const)('reads %s as %s', (value, change) => {
    expect(readAuthChange(storageEvent(AUTH_CHANGE_KEY, value))).toBe(change);
  });

  it('returns null for another key', () => {
    expect(readAuthChange(storageEvent('brewform-static-cache-bust', 'logout:1'))).toBeNull();
  });

  it('returns null for a removal (newValue null) and for clear() (key null)', () => {
    expect(readAuthChange(storageEvent(AUTH_CHANGE_KEY, null))).toBeNull();
    expect(readAuthChange(storageEvent(null, null))).toBeNull();
  });

  it.each(['logout', 'logout:', 'logout:abc', 'signout:1', ' login:1'])(
    'returns null for the malformed value %j',
    (value) => {
      expect(readAuthChange(storageEvent(AUTH_CHANGE_KEY, value))).toBeNull();
    },
  );
});
