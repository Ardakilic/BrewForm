import { z } from 'zod';

const BrewMethodEnum = z.enum([
  'espresso_machine',
  'v60',
  'french_press',
  'aeropress',
  'turkish_coffee',
  'drip_coffee',
  'chemex',
  'kalita_wave',
  'moka_pot',
  'cold_brew',
  'siphon',
]);

const EquipmentTypeEnum = z.enum([
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
]);

/**
 * Validates brew method compatibility creation payloads.
 * Used by POST /api/v1/admin/compatibility.
 */
export const BrewMethodCompatibilityCreateSchema = z.object({
  brewMethod: BrewMethodEnum,
  equipmentType: EquipmentTypeEnum,
  compatible: z.boolean(),
});

/**
 * Validates brew method compatibility update payloads.
 * Used by PATCH /api/v1/admin/compatibility/:id.
 */
export const BrewMethodCompatibilityUpdateSchema = z.object({
  compatible: z.boolean(),
});
