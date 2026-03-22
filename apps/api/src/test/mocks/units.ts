/**
 * Mock for src/utils/units/index.ts
 * Redirected via import_map.json during deno test runs.
 */

import { mockFn } from '../mock-fn.ts';

export const calculateBrewRatio = mockFn(
  (...args: unknown[]) => (args[1] as number) / (args[0] as number),
);

export const calculateFlowRate = mockFn(
  (...args: unknown[]) => (args[0] as number) / (args[1] as number),
);

export const convertTemperature = mockFn(
  (...args: unknown[]) => args[0] as number,
);

export const convertWeight = mockFn(
  (...args: unknown[]) => args[0] as number,
);
