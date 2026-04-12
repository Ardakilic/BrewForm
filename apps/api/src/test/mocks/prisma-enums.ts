/**
 * Mock for prisma/generated/prisma — re-exports from local enums.
 * Bypasses Deno's CJS named-export interop issue with the generated Prisma client.
 * Redirected via import_map.json during deno test runs.
 */

import * as Enums from '../../types/enums.ts';

export const $Enums = {
  UnitSystem: Enums.UnitSystem,
  Theme: Enums.Theme,
  Visibility: Enums.Visibility,
  EmojiRating: Enums.EmojiRating,
  BrewMethodType: Enums.BrewMethodType,
  DrinkType: Enums.DrinkType,
  ProcessingMethod: Enums.ProcessingMethod,
  MilkPreparationType: Enums.MilkPreparationType,
  NotificationType: Enums.NotificationType,
};

export const BrewMethodType = Enums.BrewMethodType;
export const DrinkType = Enums.DrinkType;
export const EmojiRating = Enums.EmojiRating;
export const MilkPreparationType = Enums.MilkPreparationType;
export const NotificationType = Enums.NotificationType;
export const ProcessingMethod = Enums.ProcessingMethod;
export const Theme = Enums.Theme;
export const UnitSystem = Enums.UnitSystem;
export const Visibility = Enums.Visibility;
