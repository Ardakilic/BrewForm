// deno-lint-ignore no-explicit-any
import * as model from './model.ts';
import { validateImageUpload, generateFilename, saveUploadedFile, getPublicUrl } from '../../utils/upload/index.ts';
import { createLogger } from '../../utils/logger/index.ts';

const logger = createLogger('photo-service');

export async function uploadPhoto(userId: string, recipeId: string, file: { name: string; type: string; size: number; data: Uint8Array }, alt?: string, sortOrder?: number) {
  const validationError = validateImageUpload(file);
  if (validationError) throw new Error(validationError);

  const filename = generateFilename(file.name);
  const filepath = await saveUploadedFile(file.data, filename);
  logger.info({ filepath, filename }, 'Photo saved');

  const photo = await model.create({
    recipeId,
    url: getPublicUrl(filename),
    alt: alt || null,
    sortOrder: sortOrder ?? 0,
  } as any);

  return photo;
}

export async function listPhotos(recipeId: string) {
  return model.findByRecipe(recipeId);
}

export async function deletePhoto(userId: string, id: string) {
  const photo = await model.findById(id);
  if (!photo) throw new Error('PHOTO_NOT_FOUND');
  await model.softDelete(id);
}