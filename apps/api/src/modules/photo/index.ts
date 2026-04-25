import { Hono } from 'hono';
import { authMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { success, error } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const photo = new Hono<AppEnv>();

photo.post('/', authMiddleware, async (c) => {
  const userId = c.get('userId') as string;
  const formData = await c.req.formData();

  const fileField = formData.get('file');
  const recipeId = formData.get('recipeId') as string;
  const alt = (formData.get('alt') as string) || undefined;
  const sortOrder = formData.get('sortOrder') ? Number(formData.get('sortOrder')) : undefined;

  if (!fileField || !(fileField instanceof File)) {
    return error(c, 'VALIDATION_ERROR', 'File is required', 400);
  }
  if (!recipeId) {
    return error(c, 'VALIDATION_ERROR', 'Recipe ID is required', 400);
  }

  const data = new Uint8Array(await fileField.arrayBuffer());

  try {
    const result = await service.uploadPhoto(userId, recipeId, {
      name: fileField.name,
      type: fileField.type,
      size: fileField.size,
      data,
    }, alt, sortOrder);
    return success(c, result, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return error(c, 'UPLOAD_ERROR', message, 400);
  }
});

photo.get('/recipe/:recipeId', async (c) => {
  const recipeId = c.req.param('recipeId')!;
  const photos = await service.listPhotos(recipeId);
  return success(c, photos);
});

photo.delete('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id')!;
  const userId = c.get('userId') as string;
  try {
    await service.deletePhoto(userId, id);
    return success(c, { message: 'Photo deleted' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'PHOTO_NOT_FOUND') return error(c, 'NOT_FOUND', 'Photo not found', 404);
    throw err;
  }
});

export default photo;