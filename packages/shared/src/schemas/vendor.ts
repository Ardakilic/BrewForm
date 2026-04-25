import { z } from 'zod';

export const VendorCreateSchema = z.object({
  name: z.string().min(1).max(200),
  website: z.string().url().optional().or(z.literal('')),
  description: z.string().max(1000).optional(),
});

export const VendorUpdateSchema = VendorCreateSchema.partial();