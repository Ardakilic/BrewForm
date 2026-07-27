import '../../test-setup.ts';
import { beforeAll, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

let cronCalls: { name: string; schedule: string; handler: () => unknown }[] = [];

beforeAll(() => {
  cronCalls = [];
  // Deno.cron is a getter-only property on the Deno namespace, so it must be
  // replaced via Object.defineProperty rather than direct assignment. The stub
  // captures registrations without actually scheduling anything.
  Object.defineProperty(Deno, 'cron', {
    configurable: true,
    value: (name: string, schedule: string, handler: () => unknown) => {
      cronCalls.push({ name, schedule, handler });
    },
    writable: true,
  });
});

describe('cron job registration', () => {
  it('should register evaluate-badges cron job with hourly schedule', async () => {
    await import('./cron.ts');
    expect(cronCalls.length).toBeGreaterThanOrEqual(1);
    const job = cronCalls.find((c) => c.name === 'evaluate-badges');
    expect(job).toBeDefined();
    expect(job!.schedule).toBe('0 * * * *');
    expect(typeof job!.handler).toBe('function');
  });

  it('should register the cron job exactly once across repeated imports (module cache)', async () => {
    // Re-importing a cached module does not re-run its top-level body, so the
    // evaluate-badges registration count must not grow.
    const before = cronCalls.filter((c) => c.name === 'evaluate-badges').length;
    await import('./cron.ts');
    await import('./cron.ts');
    const after = cronCalls.filter((c) => c.name === 'evaluate-badges').length;
    expect(after).toBe(before);
  });

  it('should register a handler that is an async function', async () => {
    await import('./cron.ts');
    const job = cronCalls.find((c) => c.name === 'evaluate-badges');
    expect(job).toBeDefined();
    // The handler's constructor is AsyncFunction (it is declared `async ()`).
    expect(job!.handler.constructor.name).toBe('AsyncFunction');
  });
});
