import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { config } from '../../config/index.ts';
import * as service from './service.ts';
import { QrCodeFilenameSchema } from '@brewform/shared/schemas';
import { error, zodValidationHook } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const qrcode = new Hono<AppEnv>();

const FilenameParamSchema = z.object({
  filename: QrCodeFilenameSchema,
});

qrcode.get(
  '/recipe/:filename',
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
