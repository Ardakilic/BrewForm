import { z } from 'zod';

/**
 * Taste note Output Schemas.
 *
 * `TasteNoteOutputSchema` is the flat `tasteNotes` row returned by `/flat` and
 * `/search` (`model.findAll`/`searchByName`). `TasteNoteNodeOutputSchema` is the
 * recursive hierarchy node returned by `/hierarchy` (`model.getHierarchy`),
 * where each node carries a `children[]` array of the same shape — modeled with
 * `z.lazy` for the self-reference.
 *
 * Verified against `packages/db/src/schema.ts` (`tasteNotes`) and
 * `apps/api/src/modules/taste/{service,model}.ts`.
 */
export const TasteNoteOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  color: z.string().nullable(),
  definition: z.string().nullable(),
  depth: z.number().int(),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
});

export type TasteNoteOutput = z.infer<typeof TasteNoteOutputSchema>;

/** Recursive hierarchy node: a flat taste note plus its `children[]`. */
export type TasteNoteNodeOutput = TasteNoteOutput & {
  children: TasteNoteNodeOutput[];
};

export const TasteNoteNodeOutputSchema: z.ZodType<TasteNoteNodeOutput> = TasteNoteOutputSchema
  .extend({
    children: z.lazy(() => z.array(TasteNoteNodeOutputSchema)),
  });
