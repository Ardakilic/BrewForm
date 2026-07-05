import { z } from 'zod';
import { EQUIPMENT_TYPE_VALUES } from '../constants/index.ts';

const EquipmentTypeEnum = z.enum(EQUIPMENT_TYPE_VALUES);

/**
 * Validates equipment-creation payloads.
 * Used by POST /api/v1/equipment and POST /api/v1/admin/equipment.
 */
export const EquipmentCreateSchema = z.object({
  name: z.string().min(1).max(200),
  type: EquipmentTypeEnum,
  brand: z.string().max(200).optional(),
  model: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
});

/**
 * Validates partial equipment-update payloads.
 * Used by PATCH /api/v1/equipment/:id and PATCH /api/v1/admin/equipment/:id.
 */
export const EquipmentUpdateSchema = EquipmentCreateSchema.partial();

/**
 * Validates equipment list query params (type, search, pagination).
 * Used by GET /api/v1/equipment.
 */
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

/** Inferred TypeScript type for equipment-creation payloads. */
export type EquipmentCreate = z.infer<typeof EquipmentCreateSchema>;
/** Inferred TypeScript type for partial equipment-update payloads. */
export type EquipmentUpdate = z.infer<typeof EquipmentUpdateSchema>;
