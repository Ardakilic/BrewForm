import { z } from 'zod';

/**
 * Reusable Output Schema building blocks shared across entity response schemas.
 *
 * These mirror the real service return projections (see each module's
 * `service.ts`/`model.ts`). With `hono-openapi` v1 + `zod-openapi` v5,
 * `resolver()` reads field metadata natively from the Zod v4 schema structure —
 * no `zod-openapi/extend` import is needed (that subpath does not exist in v5).
 *
 * Timestamp fields use `z.string()` because Hono's `c.json` serializes `Date`
 * values to ISO strings on the wire.
 */

/** Message-only payload returned by delete endpoints — `{ message }`. */
export const MessageResponseSchema = z.object({ message: z.string() });

/**
 * Nullable author projection used by comment/recipe left-joins.
 * `leftJoin` means the joined author object can be `null`.
 */
export const AuthorRefSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    displayName: z.string().nullable(),
    avatarUrl: z.string().nullable(),
  })
  .nullable();

/** Minimal recipe-author projection for equipment/coffee-variety recipe lists. */
export const RecipeAuthorMiniSchema = z.object({
  username: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});
