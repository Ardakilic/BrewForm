import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
}));
vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }));

vi.mock('../api/index.ts', () => ({
  authApi: { registrationStatus: vi.fn() },
}));

import { authApi } from '../api/index.ts';
import { ROOT_ROUTE_ID, rootLoader, shouldRevalidateRoot } from './root.ts';

const mockStatus = vi.mocked(authApi.registrationStatus);

/** Loader args for a request to `/`. */
function args(signal?: AbortSignal) {
  return { request: new Request('http://localhost/', { signal }), params: {}, context: undefined };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('rootLoader', () => {
  it('returns the server registration flag and forwards the request signal', async () => {
    mockStatus.mockResolvedValue({ enabled: false });
    await expect(rootLoader(args() as never)).resolves.toEqual({ registrationEnabled: false });
    expect(mockStatus).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
  });

  it('falls back to registrationEnabled: true and logs when the status check fails', async () => {
    const err = new Error('down');
    mockStatus.mockRejectedValue(err);
    await expect(rootLoader(args() as never)).resolves.toEqual({ registrationEnabled: true });
    expect(mockLogger.error).toHaveBeenCalledWith({ err }, 'rootLoader registrationStatus failed');
  });

  it('rethrows an aborted request without logging an error', async () => {
    mockStatus.mockRejectedValue(new DOMException('aborted', 'AbortError'));
    await expect(rootLoader(args() as never)).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('never revalidates and is addressed by the root route id', () => {
    expect(shouldRevalidateRoot()).toBe(false);
    expect(ROOT_ROUTE_ID).toBe('root');
  });
});
