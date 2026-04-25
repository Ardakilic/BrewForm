import * as model from './model.ts';
import { generateQRCodePng, generateQRCodeSvg } from '../../utils/qrcode/index.ts';

export async function getRecipeQRCode(slug: string, format: 'png' | 'svg', baseUrl: string) {
  const recipe = await model.findBySlug(slug);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  if (recipe.visibility === 'draft' || recipe.visibility === 'private') {
    throw new Error('RECIPE_NOT_AVAILABLE');
  }

  const url = `${baseUrl}/recipes/${slug}`;
  if (format === 'png') {
    const data = await generateQRCodePng(url);
    return { data: data.buffer as ArrayBuffer, contentType: 'image/png' };
  }
  const data = await generateQRCodeSvg(url);
  return { data, contentType: 'image/svg+xml' };
}