/**
 * Mock for src/utils/units/index.ts
 * Redirected via import_map.json during deno test runs.
 */

import { spy } from "@std/testing/mock";

export const calculateBrewRatio = spy(() => 16.67);

export const calculateFlowRate = spy(() => 2.0);

export const convertTemperature = spy((v: number) => v);

export const convertWeight = spy((v: number) => v);

export const formatWeight = spy((v: number) => `${v}g`);

export const formatVolume = spy((v: number) => `${v}ml`);

export const formatTemperature = spy((v: number) => `${v}°C`);
