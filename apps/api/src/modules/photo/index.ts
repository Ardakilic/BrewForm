import { z } from 'zod';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import {
  ErrorEnvelopeSchema,
  MessageResponseSchema,
  PhotoOutputSchema,
  successEnvelope,
} from '@brewform/shared/schemas';
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

photo.post(
  '/',
  describeRoute({
    tags: ['Photos'],
    summary: 'Upload a recipe photo',
    description:
      'Uploads a photo for a recipe via multipart/form-data. The file is parsed manually (not via zValidator).',
    security: [{ bearerAuth: [] }],
    requestBody: {
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            required: ['file', 'recipeId'],
            properties: {
              file: { type: 'string', format: 'binary', description: 'The photo file' },
              thumbnail: {
                type: 'string',
                format: 'binary',
                description: 'Optional pre-generated thumbnail',
              },
              recipeId: { type: 'string', format: 'uuid' },
              alt: { type: 'string', maxLength: 200 },
              sortOrder: { type: 'integer', minimum: 0 },
            },
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Photo uploaded',
        content: {
          'application/json': { schema: resolver(successEnvelope(PhotoOutputSchema)) },
        },
      },
      400: {
        description: 'Validation or upload error',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      403: {
        description: 'Not your recipe',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Recipe not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authMiddleware,
  async (c) => {
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
  },
);

photo.get(
  '/recipe/:recipeId',
  describeRoute({
    tags: ['Photos'],
    summary: 'List photos for a recipe',
    description: 'Returns all photos attached to the given recipe.',
    parameters: [
      { name: 'recipeId', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'List of photos',
        content: {
          'application/json': {
            schema: resolver(successEnvelope(z.array(PhotoOutputSchema))),
          },
        },
      },
    },
  }),
  async (c) => {
    const recipeId = c.req.param('recipeId')!;
    const photos = await service.listPhotos(recipeId);
    return success(c, photos);
  },
);

photo.delete(
  '/:id',
  describeRoute({
    tags: ['Photos'],
    summary: 'Delete a photo',
    description: 'Deletes a photo owned by the authenticated user.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'Photo deleted',
        content: {
          'application/json': { schema: resolver(successEnvelope(MessageResponseSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      403: {
        description: 'Forbidden',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Photo not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authMiddleware,
  async (c) => {
    const id = c.req.param('id')!;
    const userId = c.get('userId') as string;
    try {
      await service.deletePhoto(userId, id);
      return success(c, { message: 'Photo deleted' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'PHOTO_NOT_FOUND') return error(c, 'NOT_FOUND', 'Photo not found', 404);
      if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Forbidden', 403);
      throw err;
    }
  },
);

export default photo;
