/**
 * Photo upload and management for BrewForm.
 *
 * Handles image validation, file persistence via the upload utility, thumbnail
 * generation, and soft-deletion of recipe photos.
 */
import * as model from './model.ts';
import * as recipeModel from '../recipe/model.ts';
import { photos } from '@brewform/db/schema';
import {
  generateFilename,
  getPublicUrl,
  saveThumbnail,
  saveUploadedFile,
  validateImageUpload,
} from '../../utils/upload/index.ts';
import { createLogger } from '../../utils/logger/index.ts';

const logger = createLogger('photo-service');

/** Inferred insert type for the `photos` table (current Drizzle idiom). */
type PhotoInsert = typeof photos.$inferInsert;

/**
 * Upload a photo for a recipe.
 *
 * Verifies that the recipe exists and the caller is the recipe author before
 * saving the file. Validates the image, generates a unique filename, persists
 * the file and optional thumbnail, then creates a photo record.
 *
 * @param userId    - The ID of the user uploading the photo
 * @param recipeId  - The recipe the photo belongs to
 * @param file      - Uploaded file metadata and binary data
 * @param thumbnail - Optional thumbnail binary data
 * @param alt       - Optional alt text
 * @param sortOrder - Optional display order (defaults to 0)
 * @throws RECIPE_NOT_FOUND if the recipe doesn't exist
 * @throws FORBIDDEN if the user is not the recipe author
 * @returns The created photo record
 */
export async function uploadPhoto(
  userId: string,
  recipeId: string,
  file: { name: string; type: string; size: number; data: Uint8Array },
  thumbnail: Uint8Array | null,
  alt?: string,
  sortOrder?: number,
) {
  const recipe = await recipeModel.findById(recipeId);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  if (recipe.authorId !== userId) throw new Error('FORBIDDEN');

  const validationError = validateImageUpload(file);
  if (validationError) throw new Error(validationError);

  const filename = generateFilename(file.name);
  const filepath = await saveUploadedFile(file.data, filename);
  const url = getPublicUrl(filename);
  const thumbnailUrl = await saveThumbnail(thumbnail, filename, url, 'medium');
  logger.info({ filepath, filename, hasThumbnail: thumbnail !== null }, 'Photo saved');

  const photo = await model.create(
    {
      recipeId,
      url,
      thumbnailUrl,
      alt: alt || null,
      sortOrder: sortOrder ?? 0,
    } satisfies PhotoInsert,
  );

  return photo;
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
