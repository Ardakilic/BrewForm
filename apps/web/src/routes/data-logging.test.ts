import { describe, expect, it, vi } from 'vitest';
import { withDataLog } from './data-logging.ts';

/** A fresh logger double. */
function makeLog() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  };
}

describe('withDataLog', () => {
  it('logs started/completed with the ids and returns the result', async () => {
    const log = makeLog();
    await expect(withDataLog(log as never, 'Page load', { id: 'x' }, async () => 42)).resolves.toBe(
      42,
    );
    expect(log.debug).toHaveBeenCalledWith({ id: 'x' }, 'Page load started');
    expect(log.debug).toHaveBeenCalledWith({ id: 'x' }, 'Page load completed');
  });

  it('logs failed with the error and rethrows', async () => {
    const log = makeLog();
    const err = new Error('boom');
    await expect(
      withDataLog(log as never, 'Page load', { id: 'x' }, async () => {
        throw err;
      }),
    ).rejects.toBe(err);
    expect(log.error).toHaveBeenCalledWith({ err, id: 'x' }, 'Page load failed');
  });

  it('does not log thrown Responses or aborts as failures', async () => {
    const log = makeLog();
    const notFound = new Response('', { status: 404 });
    await expect(
      withDataLog(log as never, 'L', {}, async () => {
        throw notFound;
      }),
    ).rejects.toBe(notFound);
    await expect(
      withDataLog(log as never, 'L', {}, async () => {
        throw new DOMException('aborted', 'AbortError');
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(log.error).not.toHaveBeenCalled();
  });
});
