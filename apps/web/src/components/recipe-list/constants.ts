/**
 * Recipe-list module constants.
 *
 * Re-exports the canonical {@link EQUIPMENT_TYPE_LABELS} from
 * `@brewform/shared/constants` so the recipe list UI never carries a
 * drift-prone local copy, and exposes a UI-ordered list of equipment
 * types to render as separate filter dropdowns.
 */
export { EQUIPMENT_TYPE_LABELS } from '@brewform/shared/constants';

/**
 * Ordered list of equipment types to surface as separate filter
 * dropdowns in the recipe-list sidebar.
 *
 * The 17 entries match `EquipmentType` from `@brewform/shared/types`;
 * the ordering is a UI concern (the shared package intentionally does
 * not define an order).
 */
export const EQUIPMENT_FILTER_TYPES = [
  'espresso_machine',
  'grinder',
  'pour_over_brewer',
  'immersion_brewer',
  'kettle',
  'milk_tool',
  'scale_accessory',
  'roaster',
  'portafilter',
  'basket',
  'puck_screen',
  'paper_filter',
  'tamper',
  'mesh_filter',
  'cezve',
  'thermometer',
  'other',
] as const;

/** Union type of every equipment filter type in {@link EQUIPMENT_FILTER_TYPES}. */
export type EquipmentFilterType = (typeof EQUIPMENT_FILTER_TYPES)[number];
