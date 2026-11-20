import { z } from 'zod';

/** Validates page/perPage list query params (1-based page, perPage capped at 100); shared by paginated endpoints. */
export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
});

/** Validates an 'asc'/'desc' sort-order query param (default 'desc'). */
export const SortOrderSchema = z.enum(['asc', 'desc']).default('desc');

/** Validates a UUID string; shared building block for id path params and payload fields. */
export const UuidSchema = z.uuid();

/**
 * Normalizes and validates an account email: trims, lower-cases, caps at 255 characters (the
 * `user.email` column size) and only then checks the email format.
 *
 * The format check sits after `.pipe()` on purpose: Zod 4 runs a format schema's own check before
 * any chained transform, so `z.email().trim()` would reject `' a@b.co '`. Lower-casing is safe
 * because Zod's email pattern accepts only ASCII, where JavaScript `toLowerCase()` and Postgres
 * `lower()` agree. `z.toJSONSchema` resolves the pipe to its output side, so OpenAPI still documents
 * an email string. Used by register, login, forgot-password and admin create/update (not the
 * contact form, whose email is not an account identifier).
 */
export const EmailSchema = z.string().trim().toLowerCase().max(255).pipe(z.email());

/** Validates a lowercase kebab-case slug (e.g. recipe slugs in path params). */
export const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/**
 * QR code filename pattern: `<slug>.png` or `<slug>.svg` (case-insensitive). Group 1 is the slug,
 * group 2 the format. Segments may contain `_` because legacy slugs (from the pre-wave-6 `\w`-based
 * generator) can; newly issued slugs never do (see {@link SlugSchema}). Hyphens cannot lead, trail
 * or repeat, and `.`/`/` are never accepted, so the filename cannot traverse paths.
 */
export const QR_CODE_FILENAME_PATTERN = /^([a-z0-9_]+(?:-[a-z0-9_]+)*)\.(png|svg)$/i;

/**
 * Validates QR code filename format (slug + extension) with {@link QR_CODE_FILENAME_PATTERN}.
 * Legacy slugs may contain `_`; new slugs never do.
 * Used by GET /api/v1/qrcode/recipe/:filename.
 */
export const QrCodeFilenameSchema = z
  .string()
  .regex(QR_CODE_FILENAME_PATTERN, 'Filename must be in format {slug}.{png|svg}');

/**
 * Validates search query parameters.
 * Used by GET /api/v1/equipment/search, GET /api/v1/vendors/search, and GET /api/v1/coffee-varieties/search.
 */
export const SearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(200),
});
