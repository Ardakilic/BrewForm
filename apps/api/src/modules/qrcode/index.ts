import { Hono } from 'hono';
import { config } from '../../config/index.ts';
import * as service from './service.ts';
import { error } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const qrcode = new Hono<AppEnv>();

// Route pattern: /recipe/:filename where filename is "slug.png" or "slug.svg".
// We extract the slug by stripping the extension.
qrcode.get('/recipe/:filename', async (c) => {
  const filename = c.req.param('filename') ?? '';
  const isPng = filename.endsWith('.png');
  const isSvg = filename.endsWith('.svg');
  if (!isPng && !isSvg) {
    return error(c, 'BAD_REQUEST', 'Format must be .png or .svg', 400);
  }
  const format = isPng ? 'png' : 'svg';
  const slug = filename.slice(0, filename.lastIndexOf('.'));
  if (!slug) return error(c, 'BAD_REQUEST', 'Missing slug', 400);

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
});

export default qrcode;
