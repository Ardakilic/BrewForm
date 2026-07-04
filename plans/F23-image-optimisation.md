# F23 — Image Optimisation Pipeline

> **Validation status (2026-07-04): 🔧 Rough — needs design decisions**
>
> - The image-processing library is "TBD" and all image operations are stubs returning the originals — the core value is unimplementable until a library (e.g. sharp-equivalent for the runtime) is chosen.
> - Schema/API surface is fine (photos table indeed lacks a blurPlaceholder column, as the plan assumes).

## Overview

Add WebP/AVIF conversion, responsive image sizes, and lazy loading with blur placeholders. Images uploaded to BrewForm are automatically processed into multiple sizes and formats for optimal delivery.

## Goals

1. Convert uploaded images to WebP format (primary) with JPEG fallback
2. Generate responsive thumbnail sizes (320w, 640w, 1280w)
3. Generate base64 blur placeholders on upload
4. Serve responsive images via `<picture>` element with srcset
5. Process existing photos on deployment via background job

## User Stories

| # | As a… | I want to… | So that… |
|---|-------|-----------|----------|
| US-1 | Visitor | See recipe photos load quickly | I can browse recipes without slow image loads |
| US-2 | Visitor | See low-quality blur placeholders while images load | I have a better visual experience |
| US-3 | Mobile user | Receive appropriately sized images | I don't waste bandwidth on oversized images |
| US-4 | Authenticated user | Upload photos that are automatically optimized | I don't need to manually compress images |
| US-5 | Visitor | Use WebP images where supported | I get faster loading with modern formats |

## Technical Design

### Schema Change: blurPlaceholder Column

This feature adds a `blurPlaceholder` column to the existing `photos` table.

### Image Processing Utilities

Create `apps/api/src/utils/image/index.ts`:

```ts
/**
 * Image processing utilities for BrewForm.
 * Uses Deno's native image operations via sharp-like API.
 */

export interface ImageSizes {
  sm: Uint8Array;  // 320w
  md: Uint8Array;  // 640w
  lg: Uint8Array;  // 1280w
  original: Uint8Array;
}

export interface ProcessedImage {
  webp: ImageSizes;
  jpeg: ImageSizes; // Fallback
  blurPlaceholder: string; // base64 data URI
}

/**
 * Generate responsive sizes from original image bytes.
 * Returns 320w, 640w, 1280w variants.
 */
export async function generateResponsiveSizes(
  imageBytes: Uint8Array,
): Promise<{ sm: Uint8Array; md: Uint8Array; lg: Uint8Array }> {
  // Implementation depends on Deno image processing library
  // Options: @aspect-build/rules_js, image-rs, or custom WASM
  // For now, return original as placeholder
  return {
    sm: imageBytes, // Will resize to 320w
    md: imageBytes, // Will resize to 640w
    lg: imageBytes, // Will resize to 1280w
  };
}

/**
 * Convert image bytes to WebP format.
 */
export async function convertToWebP(
  imageBytes: Uint8Array,
  quality: number = 85,
): Promise<Uint8Array> {
  // Implementation: use Deno's native image codec or sharp binding
  return imageBytes;
}

/**
 * Convert image bytes to JPEG format (fallback).
 */
export async function convertToJpeg(
  imageBytes: Uint8Array,
  quality: number = 90,
): Promise<Uint8Array> {
  return imageBytes;
}

/**
 * Generate a 20px wide base64 blur placeholder.
 */
export async function generateBlurPlaceholder(
  imageBytes: Uint8Array,
): Promise<string> {
  // Resize to 20px width, convert to base64 data URI
  const placeholder = 'data:image/webp;base64,';
  return placeholder;
}
```

### Enhanced Photo Service

Modify `apps/api/src/modules/photo/service.ts`:

```ts
import {
  generateResponsiveSizes,
  convertToWebP,
  generateBlurPlaceholder,
} from '../../utils/image/index.ts';

/**
 * Process uploaded image into multiple sizes and formats.
 * Stores originals and generates optimized versions.
 */
export async function processAndUploadPhoto(
  userId: string,
  recipeId: string,
  file: { name: string; type: string; size: number; data: Uint8Array },
  alt?: string,
  sortOrder?: number,
) {
  // Validate
  const validationError = validateImageUpload(file);
  if (validationError) throw new Error(validationError);

  // Generate responsive sizes
  const sizes = await generateResponsiveSizes(file.data);

  // Convert to WebP
  const webpSm = await convertToWebP(sizes.sm);
  const webpMd = await convertToWebP(sizes.md);
  const webpLg = await convertToWebP(sizes.lg);

  // Generate blur placeholder
  const blurPlaceholder = await generateBlurPlaceholder(file.data);

  // Generate filenames
  const baseName = generateFilename(file.name);
  const ext = baseName.split('.').pop();

  // Store files
  const urls: Record<string, string> = {};
  for (const [size, bytes] of [['sm', webpSm], ['md', webpMd], ['lg', webpLg]]) {
    const filename = baseName.replace(`.${ext}`, `-${size}.webp`);
    await saveUploadedFile(bytes, filename);
    urls[size] = getPublicUrl(filename);
  }

  // Store original as fallback
  const originalFilename = baseName;
  await saveUploadedFile(file.data, originalFilename);
  urls.original = getPublicUrl(originalFilename);

  // Create photo record with responsive URLs
  const photo = await model.create({
    recipeId,
    url: urls.original, // Fallback
    thumbnailUrl: urls.sm, // Small version for thumbnails
    blurPlaceholder,
    alt: alt || null,
    sortOrder: sortOrder ?? 0,
  } as any);

  return photo;
}
```

### Schema Enhancement (Optional)

Add `blurPlaceholder` field to existing `photos` table:

```ts
// In packages/db/src/schema.ts — photos table
export const photos = pgTable(
  'photo',
  {
    // ... existing fields
    blurPlaceholder: text('blur_placeholder'), // base64 data URI
  },
  // ... existing indexes
);
```

Run `make db-generate` to create migration.

### Frontend Components

#### ResponsiveImage Component

Create `apps/web/src/components/photos/ResponsiveImage.tsx`:

```tsx
import { useState } from 'react';

interface ResponsiveImageProps {
  src: string;
  srcSet?: string;
  blurPlaceholder?: string;
  alt: string;
  className?: string;
}

export function ResponsiveImage({
  src,
  srcSet,
  blurPlaceholder,
  alt,
  className,
}: ResponsiveImageProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {blurPlaceholder && !loaded && (
        <img
          src={blurPlaceholder}
          alt=""
          className="absolute inset-0 w-full h-full object-cover blur scale-110"
        />
      )}
      <img
        src={src}
        srcSet={srcSet}
        alt={alt}
        onLoad={() => setLoaded(true)}
        className={`transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}
```

#### PictureElement Component

```tsx
interface PictureElementProps {
  smUrl: string;
  mdUrl: string;
  lgUrl: string;
  originalUrl: string;
  blurPlaceholder?: string;
  alt: string;
  className?: string;
}

export function PictureElement({
  smUrl,
  mdUrl,
  lgUrl,
  originalUrl,
  blurPlaceholder,
  alt,
  className,
}: PictureElementProps) {
  return (
    <picture>
      <source
        media="(max-width: 640px)"
        srcSet={smUrl}
      />
      <source
        media="(max-width: 1280px)"
        srcSet={mdUrl}
      />
      <source
        media="(min-width: 1281px)"
        srcSet={lgUrl}
      />
      <ResponsiveImage
        src={originalUrl}
        blurPlaceholder={blurPlaceholder}
        alt={alt}
        className={className}
      />
    </picture>
  );
}
```

#### Modifications to Existing Components

- **RecipeDetailPage**: Use `PictureElement` instead of plain `<img>`
- **PhotoGallery**: Use `ResponsiveImage` with blur placeholders

### Background Migration Job

Create `apps/api/src/utils/jobs/optimize-existing-photos.ts`:

```ts
/**
 * Background job to process existing photos on deployment.
 * Runs once, processes unoptimized photos.
 */
export async function optimizeExistingPhotos() {
  const photos = await db.select().from(photosTable)
    .where(isNull(photosTable.blurPlaceholder));

  for (const photo of photos) {
    try {
      // Fetch original image
      const response = await fetch(photo.url);
      const bytes = new Uint8Array(await response.arrayBuffer());

      // Generate blur placeholder
      const blurPlaceholder = await generateBlurPlaceholder(bytes);

      // Update photo record
      await db.update(photosTable)
        .set({ blurPlaceholder })
        .where(eq(photosTable.id, photo.id));
    } catch (err) {
      logger.error({ err, photoId: photo.id }, 'Failed to optimize photo');
    }
  }
}
```

## API Endpoints

No new endpoints — existing photo upload endpoint processes images automatically.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/photos` | Required | Upload photo (now with optimization) |

## Acceptance Criteria

- [ ] Uploaded images are converted to WebP format
- [ ] Responsive sizes (320w, 640w, 1280w) are generated
- [ ] Base64 blur placeholder is generated on upload
- [ ] `<picture>` element with srcset is used for recipe photos
- [ ] Blur placeholder shows while image loads
- [ ] JPEG fallback for browsers without WebP support
- [ ] Existing photos are processed on deployment
- [ ] Type-check passes (`make check`)
- [ ] Lint passes (`make lint`)
- [ ] Tests pass (`make test`)

## Implementation Steps

1. Add `blurPlaceholder` field to `photos` table in schema
2. Run `make db-generate` and `make db-migrate`
3. Create `apps/api/src/utils/image/index.ts` — image processing utilities
4. Modify `apps/api/src/modules/photo/service.ts` — add `processAndUploadPhoto`
5. Create `apps/web/src/components/photos/ResponsiveImage.tsx`
6. Create `apps/web/src/components/photos/PictureElement.tsx`
7. Modify `RecipeDetailPage` to use responsive images
8. Create background migration job for existing photos
9. Write tests for image processing and photo service
10. Run `make check && make lint && make test`

## Dependencies

- Existing `photos` table
- Existing upload utilities (`saveUploadedFile`, `getPublicUrl`)
- Image processing library (TBD — Deno native or WASM binding)
- Existing `authMiddleware`
