import { Hono } from 'hono';
import { config } from '../../config/index.ts';
import * as service from './service.ts';
import { error } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const qrcode = new Hono<AppEnv>();

qrcode.get('/recipe/:slug.png', async (c) => {
  const slug = c.req.param('slug')!;
  try {
    const result = await service.getRecipeQRCode(slug, 'png', config.APP_URL);
    return new Response(result.data, { headers: { 'Content-Type': result.contentType, 'Cache-Control': 'public, max-age=86400' } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'RECIPE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Recipe not found', 404);
    if (message === 'RECIPE_NOT_AVAILABLE') return error(c, 'FORBIDDEN', 'Recipe is not publicly available', 403);
    throw err;
  }
});

qrcode.get('/recipe/:slug.svg', async (c) => {
  const slug = c.req.param('slug')!;
  try {
    const result = await service.getRecipeQRCode(slug, 'svg', config.APP_URL);
    return new Response(result.data, { headers: { 'Content-Type': result.contentType, 'Cache-Control': 'public, max-age=86400' } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'RECIPE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Recipe not found', 404);
    if (message === 'RECIPE_NOT_AVAILABLE') return error(c, 'FORBIDDEN', 'Recipe is not publicly available', 403);
    throw err;
  }
});

export default qrcode;