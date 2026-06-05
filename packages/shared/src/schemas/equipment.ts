import { z } from 'zod';
import { EQUIPMENT_TYPE_VALUES } from '../constants/index.ts';

const EquipmentTypeEnum = z.enum(EQUIPMENT_TYPE_VALUES);

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
