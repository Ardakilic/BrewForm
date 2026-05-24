/**
 * Photo upload and management for BrewForm.
 *
 * Handles image validation, file persistence via the upload utility, thumbnail
 * generation, and soft-deletion of recipe photos.
 */
// deno-lint-ignore-file no-explicit-any
import * as model from './model.ts';
import {
  generateFilename,
  getPublicUrl,
  saveThumbnail,
  saveUploadedFile,
  validateImageUpload,
} from '../../utils/upload/index.ts';
import { createLogger } from '../../utils/logger/index.ts';

const logger = createLogger('photo-service');

/**
 * Upload a photo for a recipe.
 *
 * Validates the image, generates a unique filename, persists the file and
 * optional thumbnail, then creates a photo record.
 *
 * @param file - Uploaded file metadata and binary data
 * @param thumbnail - Optional thumbnail binary data
 * @param alt - Optional alt text
 * @param sortOrder - Optional display order (defaults to 0)
 * @returns The created photo record
 */
export async function uploadPhoto(
  _userId: string,
  recipeId: string,
  file: { name: string; type: string; size: number; data: Uint8Array },
  thumbnail: Uint8Array | null,
  alt?: string,
  sortOrder?: number,
) {
  const validationError = validateImageUpload(file);
  if (validationError) throw new Error(validationError);

  const filename = generateFilename(file.name);
  const filepath = await saveUploadedFile(file.data, filename);
  const url = getPublicUrl(filename);
  const thumbnailUrl = await saveThumbnail(thumbnail, filename, url, 'medium');
  logger.info({ filepath, filename, hasThumbnail: thumbnail !== null }, 'Photo saved');

  const photo = await model.create({
    recipeId,
    url,
    thumbnailUrl,
    alt: alt || null,
    sortOrder: sortOrder ?? 0,
  } as any);

  return photo;
}

/** List all non-deleted photos for a recipe. */
export async function listPhotos(recipeId: string) {
  return model.findByRecipe(recipeId);
}

/** Soft-delete a photo. Throws PHOTO_NOT_FOUND if the photo doesn't exist. */
export async function deletePhoto(_userId: string, id: string) {
  const photo = await model.findById(id);
  if (!photo) throw new Error('PHOTO_NOT_FOUND');
  await model.softDelete(id);
}
