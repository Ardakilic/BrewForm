import { z } from 'zod';

export const BeanCreateSchema = z.object({
  name: z.string().min(1).max(200),
  brand: z.string().max(200).optional(),
  vendorId: z.string().uuid().optional(),
  roaster: z.string().max(200).optional(),
  roastLevel: z.string().max(100).optional(),
  processing: z.string().max(100).optional(),
  origin: z.string().max(200).optional(),
});

export const BeanUpdateSchema = BeanCreateSchema.partial();