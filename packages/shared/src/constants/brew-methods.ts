export const BREW_METHODS = [
  { value: 'espresso_machine', label: 'Espresso Machine', equipmentTypes: ['portafilter', 'basket', 'tamper', 'puck_screen'] },
  { value: 'v60', label: 'V60', equipmentTypes: ['paper_filter', 'gooseneck_kettle', 'scale'] },
  { value: 'french_press', label: 'French Press', equipmentTypes: ['mesh_filter', 'scale'] },
  { value: 'aeropress', label: 'AeroPress', equipmentTypes: ['paper_filter', 'scale'] },
  { value: 'turkish_coffee', label: 'Turkish Coffee (Cezve)', equipmentTypes: ['cezve'] },
  { value: 'drip_coffee', label: 'Drip Coffee', equipmentTypes: ['paper_filter', 'scale'] },
  { value: 'chemex', label: 'Chemex', equipmentTypes: ['paper_filter', 'gooseneck_kettle', 'scale'] },
  { value: 'kalita_wave', label: 'Kalita Wave', equipmentTypes: ['paper_filter', 'gooseneck_kettle', 'scale'] },
  { value: 'moka_pot', label: 'Moka Pot', equipmentTypes: ['scale'] },
  { value: 'cold_brew', label: 'Cold Brew', equipmentTypes: ['mesh_filter', 'scale'] },
  { value: 'siphon', label: 'Siphon', equipmentTypes: ['scale', 'thermometer'] },
] as const;

export type BrewMethodValue = (typeof BREW_METHODS)[number]['value'];