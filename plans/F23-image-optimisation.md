# F23 — Image Optimisation Pipeline

> **Refresh (2026-11-21, wave 6): ✅ Design decided — sharp-based server pipeline**
>
> - The old blocker ("image-processing library TBD, every conversion is a stub") is resolved: the library is **sharp** (libvips). It is a Node-API v9 addon, so it needs Node ≥ 20.9; the API image runs Node 26. sharp ships prebuilt `linux-x64`/`linux-arm64` binaries for glibc ≥ 2.28, and the `node:26.*-trixie-slim` base images ship glibc 2.41, so nothing compiles at install time. sharp has no `install`/`postinstall` script, so it needs **no** `allowBuilds` entry in `pnpm-workspace.yaml`; pnpm only has to install optional dependencies (the platform `@img/sharp-*` packages), which is the default.
> - Server-side WebP/AVIF conversion and responsive sizes (320w/640w/1280w) replace the stubbed `convertToWebP` / `generateResponsiveSizes` / `generateBlurPlaceholder`.
> - ADR-009's client-side `<canvas>` thumbnail (`apps/web/src/components/photos/PhotoUpload.tsx`) stays as the **fallback**: when server processing fails, the upload still succeeds with today's behaviour.
> - t4a's upload hardening (wave 6, ADR-019) stays the type check: `validateImagePart()` (`apps/api/src/utils/upload/index.ts`) runs the size cap, magic-byte sniffing (`utils/upload/sniff.ts`), the `UPLOAD_ALLOWED_TYPES` allowlist and the dimension limits **before** sharp decodes anything. Keys stay server-generated (`<uuid>.<ext>`); variants derive their keys from the same UUID.
> - EXIF/GPS stripping (deferred from wave 6, ADR-019 trade-off) rides with this feature: sharp drops all metadata by default and `autoOrient()` applies the EXIF orientation first, so re-encoding loses neither orientation nor privacy.
>
> _Earlier validation (2026-07-13, superseded): "🔧 Rough — needs design decisions"; it also noted that thumbnails are produced client-side and that storage is a pluggable driver (local `/uploads/<key>` or S3 `${S3_PUBLIC_URL}/<key>`). Both facts still hold and shape the design below._

## Overview

Add WebP/AVIF conversion, responsive image sizes, and lazy loading with blur placeholders. Photos uploaded to BrewForm are processed on the server with sharp into several widths and modern formats, and the web app serves them through `<picture>` with `srcset`.

## Goals

1. Generate WebP and AVIF variants at 320w, 640w and 1280w on upload (never upscaled)
2. Re-encode the stored original without metadata (EXIF/GPS stripped, orientation applied)
3. Generate a small base64 blur placeholder on upload
4. Serve responsive images via `<picture>` with `type`-keyed `<source srcset>` and the original as the `<img>` fallback
5. Backfill existing photos with a one-off script (not a per-replica cron job)
6. Keep ADR-009's client thumbnail as the fallback when processing fails

## User Stories

| # | As a… | I want to… | So that… |
|---|-------|-----------|----------|
| US-1 | Visitor | See recipe photos load quickly | I can browse recipes without slow image loads |
| US-2 | Visitor | See low-quality blur placeholders while images load | I have a better visual experience |
| US-3 | Mobile user | Receive appropriately sized images | I don't waste bandwidth on oversized images |
| US-4 | Authenticated user | Upload photos that are automatically optimized | I don't need to manually compress images |
| US-5 | Visitor | Get AVIF/WebP images where supported | I get faster loading with modern formats |
| US-6 | Authenticated user | Have location metadata removed from my photos | Publishing a photo never reveals where I took it |

## Technical Design

### Dependency

Add `sharp` (0.35.x) to `apps/api/package.json` with `pnpm --filter @brewform/api add sharp` (inside Docker: `docker compose run --rm app pnpm --filter @brewform/api add sharp`). No `pnpm-workspace.yaml` change: sharp runs no install script. Measure the API image size before and after (the prebuilt libvips binaries add to it) and record both in the PR.

### Schema Change

No JSONB columns (AGENTS.md), so variants live in a child table:

```ts
// packages/db/src/schema.ts
export const photos = pgTable(
  'photo',
  {
    // ... existing fields
    /** Tiny WebP data URI shown while the real image loads; null until processed. */
    blurPlaceholder: text('blur_placeholder'),
  },
  // ... existing indexes
);

/** One optimised rendition of a photo (format × width). */
export const photoVariants = pgTable(
  'photo_variant',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    photoId: varchar('photo_id', { length: 36 }).notNull().references(() => photos.id),
    format: varchar('format', { length: 8 }).notNull(), // 'webp' | 'avif' (CHECK constraint)
    width: integer('width').notNull(),
    url: varchar('url', { length: 500 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('photo_variant_photo_format_width_unique').on(table.photoId, table.format, table.width)],
);
```

Run `make db-generate && make db-migrate`. Variants follow their photo's soft delete (`photos.deletedAt`); they have no `deletedAt` of their own.

### Image Processing Utilities

Create `apps/api/src/utils/image/index.ts`:

```ts
/**
 * Server-side image processing (F23) with sharp. Callers pass only bytes that
 * already passed `validateImagePart()`; sharp's own pixel limit is a second guard.
 */
import sharp from 'sharp';
import { MAX_IMAGE_PIXELS } from '../upload/limits.ts';

/** Responsive widths; a variant is skipped when the source is narrower. */
export const VARIANT_WIDTHS = [320, 640, 1280] as const;

/** Output formats, newest first (the `<picture>` source order). */
export const VARIANT_FORMATS = ['avif', 'webp'] as const;

export type VariantFormat = (typeof VARIANT_FORMATS)[number];

export interface ImageVariant {
  format: VariantFormat;
  width: number;
  data: Uint8Array;
}

export interface ProcessedImage {
  /** The original re-encoded in its own format: orientation applied, metadata dropped. */
  original: Uint8Array;
  variants: ImageVariant[];
  /** `data:image/webp;base64,…`, about 20 px wide. */
  blurPlaceholder: string;
}

/** Build a pipeline with the shared input limit and EXIF auto-orientation. */
function pipeline(bytes: Uint8Array) {
  return sharp(bytes, { limitInputPixels: MAX_IMAGE_PIXELS }).autoOrient();
}

/** Process one validated upload into its original, variants and blur placeholder. */
export async function processImage(bytes: Uint8Array, sourceWidth: number): Promise<ProcessedImage> {
  // sharp removes all metadata (EXIF, GPS, XMP) unless keepMetadata()/withMetadata() is called.
  const original = new Uint8Array(await pipeline(bytes).toBuffer());

  const variants: ImageVariant[] = [];
  for (const width of VARIANT_WIDTHS.filter((w) => w <= sourceWidth)) {
    const resized = () => pipeline(bytes).resize({ width, withoutEnlargement: true });
    variants.push(
      { format: 'avif', width, data: new Uint8Array(await resized().avif({ quality: 50 }).toBuffer()) },
      { format: 'webp', width, data: new Uint8Array(await resized().webp({ quality: 80 }).toBuffer()) },
    );
  }

  const blur = await pipeline(bytes).resize({ width: 20 }).webp({ quality: 40 }).toBuffer();
  return { original, variants, blurPlaceholder: `data:image/webp;base64,${blur.toString('base64')}` };
}
```

Notes:
- `sourceWidth` comes from the `DetectedImage` that `validateImagePart()` returns (the sniffer already read the header dimensions), so the widths are chosen without a second decode.
- Older sharp releases spell auto-orientation `.rotate()` with no arguments; use `.autoOrient()` on 0.35.
- Processing is CPU-bound. Run the variants sequentially (as above) rather than with `Promise.all`, and keep `sharp.concurrency()` at its default, so one upload cannot starve the event loop of a small API container.

### Storage Keys and Content Types

In `apps/api/src/utils/upload/index.ts`, next to `thumbnailKey()`:

```ts
/** Key of one optimised variant: `<id>_<width>.<format>` (passes `assertSafeStorageKey`). */
export function variantKey(id: string, width: number, format: VariantFormat): string {
  return `${id}_${width}.${format}`;
}
```

`saveUploadedFile()` takes a `SupportedImageMime` (the upload allowlist: JPEG, PNG, WebP). AVIF is an **output** type only, so add a separate `OutputImageMime = SupportedImageMime | 'image/avif'` in `utils/upload/mime.ts` for the variant writes instead of widening `UPLOAD_ALLOWED_TYPES`. Uploading AVIF stays unsupported until the sniffer learns its signature.

### Photo Service

Extend `uploadPhoto()` in `apps/api/src/modules/photo/service.ts`; keep its order and its cleanup of written keys:

1. Ownership check and `validateImagePart()` for the original and the optional thumbnail (unchanged; nothing is decoded before this passes).
2. `processImage(file.data, image.width)` inside a `try`. On failure: `log.warn({ err: toLoggableError(err), userId, recipeId, requestId }, 'image processing failed; using client thumbnail')` and continue with today's path (store the original bytes as uploaded and the client thumbnail).
3. On success: store `processed.original` under `generateStorageKey(image.mime).key`, each variant under `variantKey(id, width, format)`, push every key into `written` for cleanup, and use the 320w WebP variant as `thumbnailUrl` (the client thumbnail is then not stored).
4. Insert the photo row with `blurPlaceholder`, then the `photo_variant` rows, in one transaction in `photo/model.ts` (services never import `drizzle-orm`).
5. Entry/exit debug logs keep ids only (`photoId`, `recipeId`, variant count), never bytes or URLs from client input.

`listPhotos()` and the recipe detail payload return `blurPlaceholder` and `variants: { format, width, url }[]`; add both to `PhotoOutputSchema` in `packages/shared/src/schemas/responses/` with a co-located test, and update the photo routes' `describeRoute()` responses.

### Frontend Components

Create `apps/web/src/components/photos/ResponsivePhoto.tsx` (resolution switching with `type`-keyed sources, not media-query art direction):

```tsx
import { useState } from 'react';
import type { PhotoOutput } from '@brewform/shared/schemas';

interface ResponsivePhotoProps {
  photo: Pick<PhotoOutput, 'url' | 'alt' | 'blurPlaceholder' | 'variants'>;
  sizes: string; // e.g. '(max-width: 640px) 100vw, 640px'
  className?: string;
}

/** Renders AVIF/WebP `srcset` sources with the stored original as the `<img>` fallback. */
export function ResponsivePhoto({ photo, sizes, className }: ResponsivePhotoProps) {
  const [loaded, setLoaded] = useState(false);
  const srcSet = (format: 'avif' | 'webp') =>
    photo.variants
      .filter((v) => v.format === format)
      .map((v) => `${v.url} ${v.width}w`)
      .join(', ');

  return (
    <div className={`relative overflow-hidden ${className ?? ''}`}>
      {photo.blurPlaceholder && !loaded && (
        <img src={photo.blurPlaceholder} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover blur" />
      )}
      <picture>
        {photo.variants.length > 0 && <source type="image/avif" srcSet={srcSet('avif')} sizes={sizes} />}
        {photo.variants.length > 0 && <source type="image/webp" srcSet={srcSet('webp')} sizes={sizes} />}
        <img
          src={photo.url}
          alt={photo.alt ?? ''}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={`transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      </picture>
    </div>
  );
}
```

Photos without variants (old rows before the backfill, or a failed processing run) render exactly as today. Photo data reaches components through the existing route loaders (ADR-018, web data loading); the component never fetches.

#### Modifications to Existing Components

- **RecipeDetailPage** (and `RecipeCard` where it shows a photo): render `ResponsivePhoto` instead of a plain `<img>`.
- **PhotoUpload**: unchanged. It still sends the `<canvas>` thumbnail (ADR-009 fallback) and maps upload error codes by shape (wave 6).
- Photo gallery wiring is a separate debt-ledger follow-up; this feature only changes how a photo renders.

### Backfill Script

Create `apps/api/scripts/optimise-existing-photos.ts` (one-off, idempotent), run once per deployment by an operator, not on a schedule:

- Select photos with `blurPlaceholder IS NULL` (`isNull(photos.blurPlaceholder)`) and `isNull(photos.deletedAt)`, in batches of 50 ordered by `createdAt`.
- Read the original through the storage driver (add a `read(key)` method to `StorageDriver` in `utils/storage/types.ts`, implemented by the local and S3 drivers), so relative local URLs and absolute S3 URLs need no special-casing. Re-run `detectImage()` on the bytes before calling sharp.
- Write variants and update the row as in the service; log failures per photo with `log.error({ err, photoId }, …)` and continue.
- Production invocation: a `make prod-optimise-photos` target running `$(PROD_COMPOSE) run --rm --no-deps --entrypoint node api /app/apps/api/scripts/optimise-existing-photos.ts`, the same pattern as `make prod-check-identifiers`. Document it in `docs/deployment_compose.md` and `docs/deployment_coolify.md`.
- Old originals are not rewritten by the backfill (their URLs are stored in rows and may be cached); only new uploads get the metadata-free original.

## API Endpoints

No new endpoints. The existing upload endpoint processes images automatically, and the photo payloads gain `blurPlaceholder` and `variants`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/photos` | Required | Upload photo (now with server-side optimisation) |

## Acceptance Criteria

- [ ] `validateImagePart()` still runs before any sharp call; a disguised non-image is rejected exactly as before (415)
- [ ] AVIF and WebP variants at 320w/640w/1280w are stored for a 2000 px upload; a 500 px upload gets only the 320w variants
- [ ] The stored original has no EXIF/GPS metadata and the correct orientation (test with a fixture carrying `Orientation=6` and GPS tags)
- [ ] A base64 blur placeholder is stored on upload
- [ ] When sharp throws, the upload still succeeds with the client thumbnail and a `warn` log
- [ ] `<picture>` with AVIF/WebP `srcset` is used for recipe photos; photos without variants render as before
- [ ] The backfill script is idempotent and processes local and S3 originals
- [ ] `PhotoOutputSchema` and the photo routes' OpenAPI responses include the new fields
- [ ] Type-check passes (`make check`)
- [ ] Lint passes (`make lint`)
- [ ] Tests pass (`make test-api`, `make test-web`, `make test-shared`)

## Implementation Steps

1. Add `sharp` to `apps/api/package.json`; confirm the API image builds and boots (`make images`)
2. Add `blurPlaceholder` and the `photo_variant` table to `packages/db/src/schema.ts`; run `make db-generate && make db-migrate`
3. Create `apps/api/src/utils/image/index.ts` with Vitest tests on small JPEG/PNG/WebP fixtures (`apps/api/src/test-fixtures/images.ts`)
4. Add `variantKey()` and `OutputImageMime` to `utils/upload`
5. Extend `photo/model.ts` and `photo/service.ts` (`uploadPhoto` processing, fallback, cleanup); extend `service.test.ts`
6. Extend `PhotoOutputSchema` and the photo routes' `describeRoute()` responses
7. Create `apps/web/src/components/photos/ResponsivePhoto.tsx` with tests; use it in `RecipeDetailPage`
8. Add `StorageDriver.read()` and `apps/api/scripts/optimise-existing-photos.ts`; document the one-off run in the deployment guides
9. Close the EXIF/GPS debt-ledger entry in `plans/D99-debts.md`
10. Run `make check && make lint && make test-api && make test-web && make test-shared`

## Dependencies

- Existing `photos` table and photo module (`apps/api/src/modules/photo/`)
- Existing upload utilities (`validateImagePart`, `generateStorageKey`, `saveUploadedFile`, `getPublicUrl`) and storage drivers
- `sharp` 0.35.x (Node-API v9; prebuilt glibc binaries; no install script)
- ADR-009 (client thumbnails, kept as fallback) and ADR-019 (server-generated keys, magic-byte sniffing)
- Existing `authMiddleware`
