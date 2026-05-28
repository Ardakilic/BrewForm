import { z } from 'zod';

export const TasteNoteFilterSchema = z.object({
  search: z.string().min(3).optional(),
  parentId: z.uuid().optional(),
  depth: z.enum(['0', '1', '2']).optional(),
});

/**
 * Validates taste note creation payloads.
 * Used by POST /api/v1/taste-notes and POST /api/v1/admin/taste-notes.
 */
export const TasteNoteCreateSchema = z.object({
  name: z.string().min(1).max(200),
  parentId: z.uuid().optional(),
  color: z.string().max(7).optional(),
  definition: z.string().max(2000).optional(),
  depth: z.number().int().min(0).max(2),
});

/**
 * Validates taste note update payloads.
 * Used by PATCH /api/v1/taste-notes/:id and PATCH /api/v1/admin/taste-notes/:id.
 */
export const TasteNoteUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  color: z.string().max(7).optional(),
  definition: z.string().max(2000).optional(),
});
