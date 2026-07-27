import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../../config/index.ts';
import * as service from './service.ts';
import { ErrorEnvelopeSchema, QrCodeFilenameSchema } from '@brewform/shared/schemas';
import { error, zodValidationHook } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

/** Hono sub-router for QR code endpoints, mounted at `/api/v1/qrcode`. */
const qrcode = new Hono<AppEnv>();

const FilenameParamSchema = z.object({
  filename: QrCodeFilenameSchema,
});

qrcode.get(
  '/recipe/:filename',
  describeRoute({
    tags: ['QR Codes'],
    summary: 'Get a recipe QR code image',
    description:
      'Generates a QR code image for a public recipe. The filename encodes the recipe slug and ' +
      'desired format (`<slug>.png` or `<slug>.svg`); the response is the raw image, not a JSON envelope.',
    parameters: [
      {
        name: 'filename',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'Recipe slug plus extension, e.g. `my-recipe.png` or `my-recipe.svg`.',
      },
    ],
    responses: {
      200: {
        description: 'QR code image (PNG or SVG, depending on the requested extension)',
        content: {
          'image/png': { schema: { type: 'string', format: 'binary' } },
          'image/svg+xml': { schema: { type: 'string', format: 'binary' } },
        },
      },
      403: {
        description: 'Recipe is not publicly available',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Recipe not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  zValidator('param', FilenameParamSchema, zodValidationHook),
  async (c) => {
    const { filename } = c.req.valid('param');
    const match = filename.match(/^([a-z0-9]+(?:-[a-z0-9]+)*)\.(png|svg)$/i);
    const slug = match![1];
    const format = match![2].toLowerCase() as 'png' | 'svg';

    try {
      const result = await service.getRecipeQRCode(slug, format, config.APP_URL);
      return new Response(result.data, {
        headers: { 'Content-Type': result.contentType, 'Cache-Control': 'public, max-age=86400' },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'RECIPE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Recipe not found', 404);
      if (message === 'RECIPE_NOT_AVAILABLE') {
        return error(c, 'FORBIDDEN', 'Recipe is not publicly available', 403);
      }
      throw err;
    }
  },
);

export default qrcode;
