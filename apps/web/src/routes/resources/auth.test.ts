import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../../api/index.ts', () => ({
  authApi: { sendVerification: vi.fn() },
}));

import { ApiError } from '../../api/errors.ts';
import { authApi } from '../../api/index.ts';
import { SEND_VERIFICATION_PATH, sendVerificationAction } from './auth.ts';

const mockSend = vi.mocked(authApi.sendVerification);

/** The action arguments for a POST to the send-verification resource route. */
function args(
  request = new Request(`http://localhost${SEND_VERIFICATION_PATH}`, { method: 'POST' }),
) {
  return { request, params: {}, context: undefined } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resources/auth/send-verification action', () => {
  it('returns { ok: true } and passes request.signal', async () => {
    mockSend.mockResolvedValue({ message: 'sent' } as never);
    const request = new Request(`http://localhost${SEND_VERIFICATION_PATH}`, { method: 'POST' });

    await expect(sendVerificationAction(args(request))).resolves.toEqual({ ok: true });
    expect(mockSend).toHaveBeenCalledWith({ signal: request.signal });
  });

  it('keeps retryAfterSeconds for a 429', async () => {
    mockSend.mockRejectedValue(new ApiError('RATE_LIMITED', 'slow down', undefined, 429, 42));

    await expect(sendVerificationAction(args())).resolves.toEqual({
      ok: false,
      error: 'slow down',
      code: 'RATE_LIMITED',
      retryAfterSeconds: 42,
    });
  });

  it("returns { ok: false, code: 'UNAUTHORIZED' } on a final 401 (no redirect)", async () => {
    mockSend.mockRejectedValue(new ApiError('UNAUTHORIZED', 'no session', undefined, 401));

    await expect(sendVerificationAction(args())).resolves.toEqual({
      ok: false,
      error: 'no session',
      code: 'UNAUTHORIZED',
    });
  });

  it('rethrows an aborted request', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    mockSend.mockRejectedValue(abort);

    await expect(sendVerificationAction(args())).rejects.toBe(abort);
  });
});
