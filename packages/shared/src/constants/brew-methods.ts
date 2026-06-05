export const BREW_METHODS = [
  {
    value: 'espresso_machine',
    label: 'Espresso Machine',
    equipmentTypes: [
      'espresso_machine',
      'grinder',
      'portafilter',
      'basket',
      'tamper',
      'puck_screen',
      'scale_accessory',
    ],
  },
  {
    value: 'v60',
    label: 'V60',
    equipmentTypes: ['pour_over_brewer', 'paper_filter', 'kettle', 'scale_accessory'],
  },
  {
    value: 'french_press',
    label: 'French Press',
    equipmentTypes: ['immersion_brewer', 'mesh_filter', 'scale_accessory', 'kettle'],
  },
  {
    value: 'aeropress',
    label: 'AeroPress',
    equipmentTypes: ['immersion_brewer', 'paper_filter', 'scale_accessory', 'kettle'],
  },
  {
    value: 'turkish_coffee',
    label: 'Turkish Coffee (Cezve)',
    equipmentTypes: ['cezve', 'scale_accessory'],
  },
  {
    value: 'drip_coffee',
    label: 'Drip Coffee',
    equipmentTypes: ['pour_over_brewer', 'paper_filter', 'scale_accessory'],
  },
  {
    value: 'chemex',
    label: 'Chemex',
    equipmentTypes: ['pour_over_brewer', 'paper_filter', 'kettle', 'scale_accessory'],
  },
  {
    value: 'kalita_wave',
    label: 'Kalita Wave',
    equipmentTypes: ['pour_over_brewer', 'paper_filter', 'kettle', 'scale_accessory'],
  },
  {
    value: 'moka_pot',
    label: 'Moka Pot',
    equipmentTypes: ['immersion_brewer', 'scale_accessory'],
  },
  {
    value: 'cold_brew',
    label: 'Cold Brew',
    equipmentTypes: ['immersion_brewer', 'mesh_filter', 'scale_accessory'],
  },
  {
    value: 'siphon',
    label: 'Siphon',
    equipmentTypes: ['scale_accessory', 'thermometer', 'kettle'],
  },
] as const;

export type BrewMethodValue = (typeof BREW_METHODS)[number]['value'];

export type BrewMethodOption = {
  value: BrewMethodValue;
  label: string;
  equipmentTypes: readonly string[];
};

/** Mutable copy for use in .map()/.filter() in React components */
export const BREW_METHODS_LIST: BrewMethodOption[] = [...BREW_METHODS];

/**
 * Pure-values tuple of every {@link BrewMethodValue}.
 *
 * Derived from {@link BREW_METHODS} via `.map()` so the tuple cannot drift
 * from the rich-object source. Consumed by Drizzle's `pgEnum()` and by Zod
 * `z.enum()` to keep the database enum, runtime validation, and TypeScript
 * union synchronised.
 */
export const BREW_METHOD_VALUES = BREW_METHODS.map((m) => m.value) as [
  BrewMethodValue,
  ...BrewMethodValue[],
];
