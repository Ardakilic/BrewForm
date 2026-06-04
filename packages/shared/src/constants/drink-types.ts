export const DRINK_TYPES = [
  { value: 'espresso', label: 'Espresso', compatibleMethods: ['espresso_machine'] },
  { value: 'americano', label: 'Americano', compatibleMethods: ['espresso_machine'] },
  { value: 'flat_white', label: 'Flat White', compatibleMethods: ['espresso_machine'] },
  { value: 'latte', label: 'Latte', compatibleMethods: ['espresso_machine'] },
  { value: 'cappuccino', label: 'Cappuccino', compatibleMethods: ['espresso_machine'] },
  { value: 'cortado', label: 'Cortado', compatibleMethods: ['espresso_machine'] },
  { value: 'macchiato', label: 'Macchiato', compatibleMethods: ['espresso_machine'] },
  { value: 'turkish_coffee', label: 'Turkish Coffee', compatibleMethods: ['turkish_coffee'] },
  { value: 'pour_over', label: 'Pour Over', compatibleMethods: ['v60', 'chemex', 'kalita_wave'] },
  { value: 'cold_brew', label: 'Cold Brew', compatibleMethods: ['cold_brew'] },
  { value: 'french_press', label: 'French Press', compatibleMethods: ['french_press'] },
  { value: 'aeropress', label: 'AeroPress', compatibleMethods: ['aeropress'] },
  { value: 'drip_coffee', label: 'Drip Coffee', compatibleMethods: ['drip_coffee'] },
  { value: 'moka_pot', label: 'Moka Pot', compatibleMethods: ['moka_pot'] },
  { value: 'siphon', label: 'Siphon', compatibleMethods: ['siphon'] },
] as const;

export type DrinkTypeValue = (typeof DRINK_TYPES)[number]['value'];

export type DrinkTypeOption = {
  value: DrinkTypeValue;
  label: string;
  compatibleMethods: readonly string[];
};

export const DRINK_TYPES_LIST: DrinkTypeOption[] = [...DRINK_TYPES];

/**
 * Pure-values tuple of every {@link DrinkTypeValue}.
 *
 * Derived from {@link DRINK_TYPES} via `.map()` so the tuple cannot drift
 * from the rich-object source. Consumed by Drizzle's `pgEnum()` and by Zod
 * `z.enum()` to keep the database enum, runtime validation, and TypeScript
 * union synchronised.
 */
export const DRINK_TYPE_VALUES = DRINK_TYPES.map((d) => d.value) as [
  DrinkTypeValue,
  ...DrinkTypeValue[],
];
