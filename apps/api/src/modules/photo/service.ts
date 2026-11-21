/**
 * Photo upload and management for BrewForm.
 *
 * Validates every uploaded part by its content (ADR-019), stores it under a
 * server-generated key, cleans up partial writes on failure, and soft-deletes
 * recipe photos.
 */

import type { photos } from '@brewform/db/schema';
import { toLoggableError } from '../../utils/errors.ts';
import { createLogger } from '../../utils/logger/index.ts';
import { type UploadPartField, UploadValidationError } from '../../utils/upload/errors.ts';
import {
  type DetectedImage,
  deleteStoredFile,
  generateStorageKey,
  saveUploadedFile,
  thumbnailKey,
  type UploadPart,
  validateImagePart,
} from '../../utils/upload/index.ts';
import type { SupportedImageMime } from '../../utils/upload/mime.ts';
import { detectImage } from '../../utils/upload/sniff.ts';
import * as recipeModel from '../recipe/model.ts';
import * as model from './model.ts';

const log = createLogger('photo-service');

/** Inferred insert type for the `photos` table (current Drizzle idiom). */
type PhotoInsert = typeof photos.$inferInsert;

/** Most characters of a client-declared Content-Type copied into a log entry. */
const MAX_LOGGED_DECLARED_TYPE = 100;

/** Ids attached to every upload log entry (a type alias, so it is assignable to log fields). */
type UploadLogContext = {
  userId: string;
  recipeId: string;
  requestId?: string;
};

/**
 * Validate one part with {@link validateImagePart}, logging a `warn` (reason,
 * field, declared and detected type, size; never the filename) on rejection.
 *
 * @throws {UploadValidationError} Rethrown after logging.
 */
function validatePart(
  part: UploadPart,
  field: UploadPartField,
  context: UploadLogContext,
): DetectedImage {
  try {
    const image = validateImagePart(part, field);
    if (part.declaredType !== '' && part.declaredType.toLowerCase() !== image.mime) {
      log.debug(
        {
          ...context,
          field,
          declaredType: part.declaredType.slice(0, MAX_LOGGED_DECLARED_TYPE),
          detectedType: image.mime,
        },
        'uploadPhoto declared type differs from detected type',
      );
    }
    return image;
  } catch (err) {
    if (err instanceof UploadValidationError) {
      log.warn(
        {
          ...context,
          reason: err.code,
          field,
          declaredType: part.declaredType.slice(0, MAX_LOGGED_DECLARED_TYPE),
          detectedType: detectImage(part.data)?.mime ?? null,
          size: part.size,
        },
        'uploadPhoto rejected an upload part',
      );
    }
    throw err;
  }
}

/**
 * Best-effort deletion of the objects written or attempted in a failed upload
 * (see {@link saveTracked}). A cleanup failure is logged at `warn` and never
 * replaces the original error.
 */
async function cleanupWrittenKeys(keys: string[], context: UploadLogContext): Promise<void> {
  for (const key of keys) {
    try {
      await deleteStoredFile(key);
    } catch (err) {
      log.warn(
        { err: toLoggableError(err), key, ...context },
        'uploadPhoto cleanup of a stored object failed',
      );
    }
  }
}

/**
 * Save one object through the storage driver, recording its key in `written` before the
 * write: a failed write can still leave a partial local file or a stored S3 object (a PUT
 * that timed out on our side), so its key must be cleaned up too. A write that fails with
 * `EEXIST` created nothing; its key is removed from `written` again, because that object
 * belongs to another upload and must never be deleted.
 *
 * @param written - The keys attempted so far for this upload (mutated).
 * @param data - The validated bytes.
 * @param key - The server-generated storage key.
 * @param mime - The server-detected MIME type.
 * @returns The URL the driver built for the object (the value stored in the photo row).
 * @throws The driver's error, unchanged.
 */
async function saveTracked(
  written: string[],
  data: Uint8Array,
  key: string,
  mime: SupportedImageMime,
): Promise<string> {
  written.push(key);
  try {
    return await saveUploadedFile(data, key, mime);
  } catch (err) {
    if ((err as { code?: unknown } | null)?.code === 'EEXIST') written.pop();
    throw err;
  }
}

/**
 * Upload a photo for a recipe.
 *
 * Order: verify the recipe exists and the caller is its author; validate the
 * original and, if present and non-empty, the thumbnail (nothing is written
 * until both pass); generate a server key from the detected type; save the
 * original, then the thumbnail (`<id>_medium.<ext>` with the thumbnail's own
 * type), then insert the photo row. The stored `url` and `thumbnailUrl` are the
 * URLs the storage driver returns. If a write or the insert fails, every object
 * written or attempted for this upload (except a key whose write failed with
 * `EEXIST`) is deleted (best effort) and the original error is rethrown.
 *
 * @param userId    - The ID of the user uploading the photo
 * @param recipeId  - The recipe the photo belongs to
 * @param file      - The original image part (declared type, size, bytes; no filename)
 * @param thumbnail - Optional client-generated thumbnail part (same shape); empty means none
 * @param alt       - Optional alt text
 * @param sortOrder - Optional display order (defaults to 0)
 * @param requestId - Optional request id, attached to the upload log entries
 * @throws RECIPE_NOT_FOUND if the recipe doesn't exist
 * @throws FORBIDDEN if the user is not the recipe author
 * @throws {UploadValidationError} if a part fails size, type or dimension validation
 * @returns The created photo record
 */
export async function uploadPhoto(
  userId: string,
  recipeId: string,
  file: UploadPart,
  thumbnail: UploadPart | null,
  alt?: string,
  sortOrder?: number,
  requestId?: string,
) {
  const context: UploadLogContext = { userId, recipeId, requestId };
  log.debug(context, 'uploadPhoto started');

  const recipe = await recipeModel.findById(recipeId);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  if (recipe.authorId !== userId) throw new Error('FORBIDDEN');

  const image = validatePart(file, 'file', context);
  const thumbnailPart = thumbnail && thumbnail.size > 0 ? thumbnail : null;
  const thumbnailImage = thumbnailPart ? validatePart(thumbnailPart, 'thumbnail', context) : null;

  const { id, key } = generateStorageKey(image.mime);
  const written: string[] = [];
  try {
    const url = await saveTracked(written, file.data, key, image.mime);

    let thumbnailUrl = url;
    if (thumbnailPart && thumbnailImage) {
      const thumbKey = thumbnailKey(id, thumbnailImage.mime);
      thumbnailUrl = await saveTracked(written, thumbnailPart.data, thumbKey, thumbnailImage.mime);
    }

    const photo = await model.create({
      recipeId,
      url,
      thumbnailUrl,
      alt: alt || null,
      sortOrder: sortOrder ?? 0,
    } satisfies PhotoInsert);

    log.info(
      {
        ...context,
        photoId: photo.id,
        key,
        mime: image.mime,
        size: file.size,
        hasThumbnail: thumbnailImage !== null,
      },
      'Photo saved',
    );
    log.debug({ ...context, photoId: photo.id }, 'uploadPhoto completed');
    return photo;
  } catch (err) {
    log.error(
      { err: toLoggableError(err), ...context, key },
      'uploadPhoto storage or insert failed',
    );
    await cleanupWrittenKeys(written, context);
    throw err;
  }
}

/** List all non-deleted photos for a recipe. */
export function listPhotos(recipeId: string) {
  return model.findByRecipe(recipeId);
}

/** Soft-delete a photo. Throws PHOTO_NOT_FOUND if the photo doesn't exist. */
export async function deletePhoto(userId: string, id: string) {
  const photo = await model.findById(id);
  if (!photo) throw new Error('PHOTO_NOT_FOUND');
  const recipe = await recipeModel.findById(photo.recipeId);
  if (!recipe || recipe.authorId !== userId) throw new Error('FORBIDDEN');
  await model.softDelete(id);
}
