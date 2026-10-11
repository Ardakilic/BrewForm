import '../../test-setup.ts';
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

vi.mock('node-cron', () => ({
  default: { schedule: vi.fn() },
}));

// The node-cron mock above replaces the real scheduler: registrations are
// captured without scheduling anything. The handle is re-grabbed after every
// `vi.resetModules()` because resetting re-runs the mock factory, producing a
// fresh `schedule` mock for the re-executed module body.
let scheduleMock: MockInstance;

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
  // Vitest 5 clears mock call history before each test (`clearMocks: true`
  // default), so every test re-executes the module body for a fresh
  // registration instead of relying on calls leaked from earlier tests.
  beforeEach(async () => {
    vi.resetModules();
    scheduleMock = vi.mocked((await import('node-cron')).default.schedule);
    await import('./cron.ts');
  });

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
