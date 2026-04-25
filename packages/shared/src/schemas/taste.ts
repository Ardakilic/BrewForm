import { z } from 'zod';

export const TasteNoteFilterSchema = z.object({
  search: z.string().min(3).optional(),
  parentId: z.string().uuid().optional(),
  depth: z.enum(['0', '1', '2']).optional(),
});