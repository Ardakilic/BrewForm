/**
 * QR code business logic for BrewForm.
 *
 * Generates QR codes (PNG or SVG) for public recipe URLs. Rejects draft
 * and private recipes. Appends `?from=qr` query param so the frontend can
 * display a dedicated "no longer available" page for delisted recipes.
 */
import * as model from './model.ts';
import { generateQRCodePng, generateQRCodeSvg } from '../../utils/qrcode/index.ts';
import { createLogger } from '../../utils/logger/index.ts';

export const log = createLogger('qrcode-service');

/**
 * Generate a QR code (PNG or SVG) for a public recipe URL.
 *
 * Appends `?from=qr` so that scans of delisted recipes show a dedicated
 * "no longer available" page instead of a generic 404.
 *
 * @param slug - Recipe slug to generate QR for
 * @param format - 'png' or 'svg'
 * @param baseUrl - Frontend base URL for constructing the full recipe URL
 * @throws RECIPE_NOT_FOUND if the recipe doesn't exist
 * @throws RECIPE_NOT_AVAILABLE if the recipe is draft or private
 */
export async function getRecipeQRCode(slug: string, format: 'png' | 'svg', baseUrl: string) {
  log.debug({ slug, format }, 'getRecipeQRCode started');
  const recipe = await model.findBySlug(slug);
  if (!recipe) {
    log.error({ slug }, 'getRecipeQRCode failed: recipe not found');
    throw new Error('RECIPE_NOT_FOUND');
  }
  if (recipe.visibility === 'draft' || recipe.visibility === 'private') {
    log.warn(
      { slug, visibility: recipe.visibility },
      'getRecipeQRCode failed: recipe not available',
    );
    throw new Error('RECIPE_NOT_AVAILABLE');
  }

  // Embed `?from=qr` so the frontend can route public-only scans of recipes
  // that have since been delisted to a dedicated "no longer available" page,
  // instead of falling through to the generic 404 (gap M3).
  const url = `${baseUrl}/recipes/${slug}?from=qr`;
  let data: ArrayBuffer | string;
  let contentType: string;
  if (format === 'png') {
    const png = await generateQRCodePng(url);
    data = png.buffer as ArrayBuffer;
    contentType = 'image/png';
  } else {
    data = await generateQRCodeSvg(url);
    contentType = 'image/svg+xml';
  }
  log.debug({ slug, format }, 'getRecipeQRCode completed');
  return { data, contentType };
}
