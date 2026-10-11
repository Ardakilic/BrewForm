import '../../test-setup.ts';
import cron from 'node-cron';
import { describe, expect, it, vi } from 'vitest';

vi.mock('node-cron', () => ({
  default: { schedule: vi.fn() },
}));

// The node-cron mock above replaces the real scheduler: registrations are
// captured without scheduling anything.
const scheduleMock = vi.mocked(cron.schedule);

type ScheduleCall = (typeof scheduleMock.mock.calls)[number];

/**
 * Finds the captured node-cron registration for the named job, failing the
 * test when it is absent so callers get a narrowed tuple without assertions.
 */
function findJobCall(name: string): ScheduleCall {
  const call = scheduleMock.mock.calls.find((c) => {
    const opts = c[2] as { name?: string } | undefined;
    return opts?.name === name;
  });
  expect(call, `expected a "${name}" cron registration`).toBeDefined();
  if (call === undefined) throw new Error(`"${name}" cron job was not registered`);
  return call;
}

describe('cron job registration', () => {
  it('should register evaluate-badges cron job with hourly schedule', async () => {
    await import('./cron.ts');
    expect(scheduleMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    const call = findJobCall('evaluate-badges');
    expect(call[0]).toBe('0 * * * *');
    expect(call[2]).toMatchObject({ name: 'evaluate-badges' });
    expect(typeof call[1]).toBe('function');
  });

  it('should register the cron job exactly once across repeated imports (module cache)', async () => {
    // Re-importing a cached module does not re-run its top-level body, so the
    // evaluate-badges registration count must not grow.
    const before = scheduleMock.mock.calls.length;
    await import('./cron.ts');
    await import('./cron.ts');
    expect(scheduleMock.mock.calls.length).toBe(before);
  });

  it('should register a handler that is an async function', async () => {
    await import('./cron.ts');
    const handler = findJobCall('evaluate-badges')[1] as (...args: unknown[]) => unknown;
    // The handler's constructor is AsyncFunction (it is declared `async ()`).
    expect(handler.constructor.name).toBe('AsyncFunction');
  });
});
