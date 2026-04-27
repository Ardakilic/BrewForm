import * as model from './model.ts';
import { generateQRCodePng, generateQRCodeSvg } from '../../utils/qrcode/index.ts';

export async function getRecipeQRCode(slug: string, format: 'png' | 'svg', baseUrl: string) {
  const recipe = await model.findBySlug(slug);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  if (recipe.visibility === 'draft' || recipe.visibility === 'private') {
    throw new Error('RECIPE_NOT_AVAILABLE');
  }

  // Embed `?from=qr` so the frontend can route public-only scans of recipes
  // that have since been delisted to a dedicated "no longer available" page,
  // instead of falling through to the generic 404 (gap M3).
  const url = `${baseUrl}/recipes/${slug}?from=qr`;
  if (format === 'png') {
    const data = await generateQRCodePng(url);
    return { data: data.buffer as ArrayBuffer, contentType: 'image/png' };
  }
  const data = await generateQRCodeSvg(url);
  return { data, contentType: 'image/svg+xml' };
}
