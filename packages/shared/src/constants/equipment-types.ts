/**
 * Equipment category enum — single source of truth.
 *
 * Consumed by:
 * - `packages/db/src/schema.ts` — Drizzle `pgEnum('equipment_type', …)`
 * - `packages/shared/src/schemas/equipment.ts` — Zod `z.enum(…)`
 * - `packages/shared/src/types/equipment.ts` — `EquipmentType` type
 *
 * Adding or removing a value here is automatically picked up by the database
 * enum, the runtime validator, and the TypeScript union. The Drizzle schema
 * uses the spread form `[...EQUIPMENT_TYPE_VALUES]` because Drizzle 0.45's
 * `pgEnum` expects a mutable tuple.
 */
export const EQUIPMENT_TYPE_VALUES = [
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

/** Union of every equipment category stored in the database. */
export type EquipmentType = (typeof EQUIPMENT_TYPE_VALUES)[number];

/** Human-readable labels keyed by {@link EquipmentType}. */
export const EQUIPMENT_TYPE_LABELS: Record<EquipmentType, string> = {
  espresso_machine: 'Espresso Machine',
  grinder: 'Grinder',
  pour_over_brewer: 'Pour-Over & Filter Brewer',
  immersion_brewer: 'Immersion & Pressure Brewer',
  kettle: 'Kettle',
  milk_tool: 'Milk Tool',
  scale_accessory: 'Scale & Accessory',
  roaster: 'Roaster',
  portafilter: 'Portafilter',
  basket: 'Basket',
  puck_screen: 'Puck Screen',
  paper_filter: 'Paper Filter',
  tamper: 'Tamper',
  mesh_filter: 'Mesh Filter',
  cezve: 'Cezve',
  thermometer: 'Thermometer',
  other: 'Other',
};

/** Mutable copy of {@link EQUIPMENT_TYPE_VALUES} for use in `.map()`/`.filter()`. */
export const EQUIPMENT_TYPES: EquipmentType[] = [...EQUIPMENT_TYPE_VALUES];
