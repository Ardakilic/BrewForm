import { z } from 'zod';
import { UuidSchema } from './common.ts';

export const SetupCreateSchema = z.object({
  name: z.string().min(1).max(100),
  brewerDetails: z.string().max(200).optional(),
  grinder: z.string().max(200).optional(),
  portafilterId: UuidSchema.optional(),
  basketId: UuidSchema.optional(),
  puckScreenId: UuidSchema.optional(),
  paperFilterId: UuidSchema.optional(),
  tamperId: UuidSchema.optional(),
  isDefault: z.boolean().default(false),
});

export const SetupUpdateSchema = SetupCreateSchema.partial();