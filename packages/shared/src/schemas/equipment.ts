import { z } from 'zod';

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

export const EquipmentCreateSchema = z.object({
  name: z.string().min(1).max(200),
  type: EquipmentTypeEnum,
  brand: z.string().max(200).optional(),
  model: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
});

export const EquipmentUpdateSchema = EquipmentCreateSchema.partial();

export const EquipmentFilterSchema = z.object({
  type: EquipmentTypeEnum.optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
});

/**
 * Validates equipment deletion request payloads.
 * Used by POST /api/v1/equipment/:id/delete-request.
 */
export const EquipmentDeleteRequestSchema = z.object({
  reason: z.string().max(500).optional(),
});
