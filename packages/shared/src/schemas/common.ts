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

/** Validates a lowercase kebab-case slug (e.g. recipe slugs in path params). */
export const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/**
 * Validates QR code filename format (slug + extension).
 * Used by GET /api/v1/recipe/:filename.
 */
export const QrCodeFilenameSchema = z.string().regex(
  /^([a-z0-9]+(?:-[a-z0-9]+)*)\.(png|svg)$/i,
  'Filename must be in format {slug}.{png|svg}',
);

/**
 * Validates search query parameters.
 * Used by GET /api/v1/equipment/search, GET /api/v1/vendors/search, and GET /api/v1/coffee-varieties/search.
 */
export const SearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(200),
});
