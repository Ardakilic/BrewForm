/**
 * Mock for prisma/generated/prisma — exports all enum values as plain objects.
 * Bypasses Deno's CJS named-export interop issue with the generated Prisma client.
 * Redirected via import_map.json during deno test runs.
 */

export const UnitSystem = {
  METRIC: 'METRIC',
  IMPERIAL: 'IMPERIAL',
} as const;

export const Theme = {
  LIGHT: 'LIGHT',
  DARK: 'DARK',
  COFFEE: 'COFFEE',
  SYSTEM: 'SYSTEM',
} as const;

export const Visibility = {
  DRAFT: 'DRAFT',
  PRIVATE: 'PRIVATE',
  UNLISTED: 'UNLISTED',
  PUBLIC: 'PUBLIC',
} as const;

export const EmojiRating = {
  SUPER_GOOD: 'SUPER_GOOD',
  GOOD: 'GOOD',
  OKAY: 'OKAY',
  BAD: 'BAD',
  HORRIBLE: 'HORRIBLE',
} as const;

export const BrewMethodType = {
  ESPRESSO_MACHINE: 'ESPRESSO_MACHINE',
  MOKA_POT: 'MOKA_POT',
  FRENCH_PRESS: 'FRENCH_PRESS',
  POUR_OVER_V60: 'POUR_OVER_V60',
  POUR_OVER_CHEMEX: 'POUR_OVER_CHEMEX',
  POUR_OVER_KALITA: 'POUR_OVER_KALITA',
  AEROPRESS: 'AEROPRESS',
  COLD_BREW: 'COLD_BREW',
  DRIP_COFFEE: 'DRIP_COFFEE',
  TURKISH_CEZVE: 'TURKISH_CEZVE',
  SIPHON: 'SIPHON',
  VIETNAMESE_PHIN: 'VIETNAMESE_PHIN',
  IBRIK: 'IBRIK',
  PERCOLATOR: 'PERCOLATOR',
  OTHER: 'OTHER',
} as const;

export const DrinkType = {
  ESPRESSO: 'ESPRESSO',
  RISTRETTO: 'RISTRETTO',
  LUNGO: 'LUNGO',
  AMERICANO: 'AMERICANO',
  LATTE: 'LATTE',
  CAPPUCCINO: 'CAPPUCCINO',
  FLAT_WHITE: 'FLAT_WHITE',
  CORTADO: 'CORTADO',
  MACCHIATO: 'MACCHIATO',
  MOCHA: 'MOCHA',
  POUR_OVER: 'POUR_OVER',
  FRENCH_PRESS: 'FRENCH_PRESS',
  COLD_BREW: 'COLD_BREW',
  ICED_COFFEE: 'ICED_COFFEE',
  TURKISH_COFFEE: 'TURKISH_COFFEE',
  AFFOGATO: 'AFFOGATO',
  IRISH_COFFEE: 'IRISH_COFFEE',
  VIETNAMESE_COFFEE: 'VIETNAMESE_COFFEE',
  OTHER: 'OTHER',
} as const;

export const ProcessingMethod = {
  WASHED: 'WASHED',
  NATURAL: 'NATURAL',
  HONEY: 'HONEY',
  SEMI_WASHED: 'SEMI_WASHED',
  WET_HULLED: 'WET_HULLED',
  ANAEROBIC: 'ANAEROBIC',
  CARBONIC_MACERATION: 'CARBONIC_MACERATION',
  OTHER: 'OTHER',
} as const;

export const MilkPreparationType = {
  STEAMED: 'STEAMED',
  FROTHED: 'FROTHED',
  COLD: 'COLD',
  HEATED: 'HEATED',
  NONE: 'NONE',
} as const;

export const NotificationType = {
  COMMENT_ON_RECIPE: 'COMMENT_ON_RECIPE',
  REPLY_TO_COMMENT: 'REPLY_TO_COMMENT',
  RECIPE_FAVOURITED: 'RECIPE_FAVOURITED',
  RECIPE_FORKED: 'RECIPE_FORKED',
} as const;

export const $Enums = {
  UnitSystem,
  Theme,
  Visibility,
  EmojiRating,
  BrewMethodType,
  DrinkType,
  ProcessingMethod,
  MilkPreparationType,
  NotificationType,
};
