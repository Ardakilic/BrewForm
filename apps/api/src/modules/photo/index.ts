import { z } from 'zod';
import { Hono } from 'hono';
import { authMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { error, success } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const photo = new Hono<AppEnv>();

const PhotoFormSchema = z.object({
  recipeId: z.uuid(),
  alt: z.string().max(200).optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

photo.post('/', authMiddleware, async (c) => {
  const userId = c.get('userId') as string;
  const formData = await c.req.formData();

  const fileField = formData.get('file') ?? formData.get('photo');
  const thumbnailField = formData.get('thumbnail');

  if (!fileField || !(fileField instanceof File)) {
    return error(c, 'VALIDATION_ERROR', 'File is required', 400);
  }

  const parsed = PhotoFormSchema.safeParse({
    recipeId: formData.get('recipeId'),
    alt: formData.get('alt') || undefined,
    sortOrder: formData.get('sortOrder') || undefined,
  });

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    return error(c, 'VALIDATION_ERROR', 'Validation failed', 400, details);
  }

  const { recipeId, alt, sortOrder } = parsed.data;

  const data = new Uint8Array(await fileField.arrayBuffer());
  const thumbnail = thumbnailField instanceof File && thumbnailField.size > 0
    ? new Uint8Array(await thumbnailField.arrayBuffer())
    : null;

  try {
    const result = await service.uploadPhoto(
      userId,
      recipeId,
      {
        name: fileField.name,
        type: fileField.type,
        size: fileField.size,
        data,
      },
      thumbnail,
      alt,
      sortOrder,
    );
    return success(c, result, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'RECIPE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Recipe not found', 404);
    if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your recipe', 403);
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
