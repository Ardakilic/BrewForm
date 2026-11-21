import '../test-setup.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createShutdownHandler,
  isShuttingDown,
  markShuttingDown,
  resetLifecycleForTests,
  type ShutdownDeps,
} from './lifecycle.ts';

/**
 * Build shutdown deps whose steps record their order in `events` (and whether the
 * process was already marked as shutting down when the server close started).
 */
function recordingDeps(overrides: Partial<Omit<ShutdownDeps, 'log'>> = {}) {
  const events: string[] = [];
  let flagAtServerClose: boolean | undefined;
  const deps = {
    closeServer: vi.fn(() => {
      flagAtServerClose = isShuttingDown();
      events.push('server');
      return Promise.resolve();
    }),
    closeDb: vi.fn(() => {
      events.push('db');
      return Promise.resolve();
    }),
    closeTransporter: vi.fn(() => {
      events.push('transporter');
    }),
    closeCache: vi.fn(() => {
      events.push('cache');
      return Promise.resolve();
    }),
    closeRateLimitStore: vi.fn(() => {
      events.push('rateLimitStore');
      return Promise.resolve();
    }),
    exit: vi.fn((code: number) => {
      events.push(`exit:${code}`);
    }),
    log: { info: vi.fn(), debug: vi.fn(), error: vi.fn() },
    ...overrides,
  };
  return { deps, events, flagAtServerClose: () => flagAtServerClose };
}

/** The `msg` argument of every call to a logger method double, in order. */
function messages(fn: ReturnType<typeof vi.fn>): string[] {
  return fn.mock.calls.map((call) => (typeof call[0] === 'string' ? call[0] : call[1]));
}

afterEach(() => {
  resetLifecycleForTests();
});

describe('lifecycle flag', () => {
  it('starts not shutting down, flips on markShuttingDown and resets for tests', () => {
    expect(isShuttingDown()).toBe(false);
    markShuttingDown();
    expect(isShuttingDown()).toBe(true);
    resetLifecycleForTests();
    expect(isShuttingDown()).toBe(false);
  });
});

describe('createShutdownHandler', () => {
  it('marks not ready before closing the server, closes every resource in order, exits 0', async () => {
    const { deps, events, flagAtServerClose } = recordingDeps();
    await createShutdownHandler(deps)();

    expect(flagAtServerClose()).toBe(true);
    expect(isShuttingDown()).toBe(true);
    expect(events).toEqual(['server', 'db', 'transporter', 'cache', 'rateLimitStore', 'exit:0']);
    expect(messages(deps.log.info)).toEqual([
      'Shutting down gracefully...',
      'HTTP server closed',
      'Database connection closed',
      'Email transporter closed',
      'Cache connection closed',
      'Rate-limit store closed',
      'Graceful shutdown complete',
    ]);
    expect(deps.log.error).not.toHaveBeenCalled();
  });

  it('ignores a second signal while shutting down (debug log, nothing closed twice)', async () => {
    let releaseServer: () => void = () => {};
    const { deps, events } = recordingDeps({
      closeServer: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            releaseServer = resolve;
          }),
      ),
    });
    const handler = createShutdownHandler(deps);

    const first = handler();
    await handler();
    expect(deps.log.debug).toHaveBeenCalledOnce();
    expect(deps.closeServer).toHaveBeenCalledOnce();
    expect(deps.closeDb).not.toHaveBeenCalled();

    releaseServer();
    await first;
    await handler();

    expect(deps.closeServer).toHaveBeenCalledOnce();
    expect(deps.closeDb).toHaveBeenCalledOnce();
    expect(deps.closeTransporter).toHaveBeenCalledOnce();
    expect(deps.closeCache).toHaveBeenCalledOnce();
    expect(deps.closeRateLimitStore).toHaveBeenCalledOnce();
    expect(deps.exit).toHaveBeenCalledOnce();
    expect(deps.log.debug).toHaveBeenCalledTimes(2);
    expect(events.at(-1)).toBe('exit:0');
  });

  it('logs an error with err and exits 1 when a step rejects', async () => {
    const failure = new Error('pool end failed');
    const { deps, events } = recordingDeps({
      closeDb: vi.fn(() => Promise.reject(failure)),
    });
    await createShutdownHandler(deps)();

    expect(deps.log.error).toHaveBeenCalledOnce();
    expect(deps.log.error.mock.calls[0][0]).toMatchObject({ err: failure });
    expect(events).toEqual(['server', 'exit:1']);
    expect(deps.closeTransporter).not.toHaveBeenCalled();
    expect(deps.exit).toHaveBeenCalledWith(1);
    expect(messages(deps.log.info)).not.toContain('Graceful shutdown complete');
  });
});
