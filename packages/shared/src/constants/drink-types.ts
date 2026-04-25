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
] as const;

export type DrinkTypeValue = (typeof DRINK_TYPES)[number]['value'];