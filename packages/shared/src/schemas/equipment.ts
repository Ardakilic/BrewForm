import { z } from 'zod';

const EquipmentTypeEnum = z.enum([
  'portafilter', 'basket', 'puck_screen', 'paper_filter',
  'tamper', 'gooseneck_kettle', 'mesh_filter', 'cezve',
  'scale', 'thermometer', 'other',
]);

export const EquipmentCreateSchema = z.object({
  name: z.string().min(1).max(200),
  type: EquipmentTypeEnum,
  brand: z.string().max(200).optional(),
  model: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
});

export const EquipmentUpdateSchema = EquipmentCreateSchema.partial();