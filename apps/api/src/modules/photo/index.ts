import {
  ErrorEnvelopeSchema,
  MessageResponseSchema,
  PhotoOutputSchema,
  successEnvelope,
} from '@brewform/shared/schemas';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.ts';
import type { AppEnv } from '../../types/hono.ts';
import { error, success } from '../../utils/response/index.ts';
import { UploadValidationError } from '../../utils/upload/errors.ts';
import type { UploadPart } from '../../utils/upload/index.ts';
import * as service from './service.ts';

/** Hono sub-router for photo endpoints, mounted at `/api/v1/photos`. */
const photo = new Hono<AppEnv>();

const PhotoFormSchema = z.object({
  recipeId: z.uuid(),
  alt: z.string().max(200).optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

/**
 * Read a multipart `File` part into the shape the service validates. Only the
 * declared type, size and bytes are read: the client filename (`name`) is
 * never touched, so it cannot reach a key, a log or a storage request.
 */
async function toUploadPart(part: File): Promise<UploadPart> {
  return {
    declaredType: part.type,
    size: part.size,
    data: new Uint8Array(await part.arrayBuffer()),
  };
}

photo.post(
  '/',
  describeRoute({
    tags: ['Photos'],
    summary: 'Upload a recipe photo',
    description:
      'Uploads a photo for a recipe via multipart/form-data (parsed manually, not via zValidator). ' +
      'The image type is detected from the file content (JPEG, PNG or WebP, limited to ' +
      '`UPLOAD_ALLOWED_TYPES`); the declared Content-Type is only a hint and the filename is ignored. ' +
      'Objects are stored under server-generated keys (`<uuid>.<ext>`, `<uuid>_medium.<ext>`). ' +
      'Limits: the original is at most `UPLOAD_MAX_SIZE_BYTES` (default 10 MiB), 16,384 px per side ' +
      'and 50 megapixels; the optional thumbnail is at most 1 MiB and 1,200 px per side. The whole ' +
      'request body is capped at `UPLOAD_MAX_SIZE_BYTES` + 1 MiB + 64 KiB (413 above that).',
    security: [{ bearerAuth: [] }],
    requestBody: {
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            required: ['file', 'recipeId'],
            properties: {
              file: {
                type: 'string',
                format: 'binary',
                description:
                  'The photo: JPEG, PNG or WebP, at most UPLOAD_MAX_SIZE_BYTES, 16,384 px per side and 50 MP',
              },
              thumbnail: {
                type: 'string',
                format: 'binary',
                description:
                  'Optional pre-generated thumbnail: JPEG, PNG or WebP, at most 1,200 px per side and 1 MiB',
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
        description: 'Validation error, file too large, or invalid image',
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
      413: {
        description: 'Request body larger than the photo upload cap (PAYLOAD_TOO_LARGE)',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      415: {
        description: 'Unsupported image type (UNSUPPORTED_MEDIA_TYPE)',
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

    const file = await toUploadPart(fileField);
    const thumbnail =
      thumbnailField instanceof File && thumbnailField.size > 0
        ? await toUploadPart(thumbnailField)
        : null;

    try {
      const result = await service.uploadPhoto(
        userId,
        recipeId,
        file,
        thumbnail,
        alt,
        sortOrder,
        c.get('requestId'),
      );
      return success(c, result, 201);
    } catch (err: unknown) {
      if (err instanceof UploadValidationError) {
        return error(c, err.code, err.message, err.status, [
          { field: err.field, message: err.message },
        ]);
      }
      const message = err instanceof Error ? err.message : '';
      if (message === 'RECIPE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Recipe not found', 404);
      if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your recipe', 403);
      // Storage, filesystem and database failures go to app.onError (500 INTERNAL_ERROR).
      throw err;
    }
  },
);

photo.get(
  '/recipe/:recipeId',
  describeRoute({
    tags: ['Photos'],
    summary: 'List photos for a recipe',
    description: 'Returns all photos attached to the given recipe.',
    parameters: [{ name: 'recipeId', in: 'path', required: true, schema: { type: 'string' } }],
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
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
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
