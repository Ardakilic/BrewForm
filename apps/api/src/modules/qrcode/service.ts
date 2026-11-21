/**
 * QR code business logic for BrewForm.
 *
 * Generates QR codes (PNG or SVG) for the recipes an anonymous viewer may open
 * (`canViewRecipe(recipe, null)`: public and unlisted). Unknown, soft-deleted,
 * draft and private slugs all throw `RECIPE_NOT_FOUND`, so the anonymous route
 * answers them with the same 404 and never reveals that a hidden recipe exists.
 * Appends `?from=qr` query param so the frontend can display a dedicated
 * "no longer available" page for delisted recipes.
 */

import { createLogger } from '../../utils/logger/index.ts';
import { generateQRCodePng, generateQRCodeSvg } from '../../utils/qrcode/index.ts';
import { canViewRecipe } from '../recipe/service.ts';
import * as model from './model.ts';

/**
 * QR code service.
 *
 * Generates PNG/SVG QR codes that link to public recipe pages.
 */
export const log = createLogger('qrcode-service');

/**
 * Generate a QR code (PNG or SVG) for a recipe URL an anonymous viewer may open.
 *
 * The recipe must pass `canViewRecipe(recipe, null)` (public or unlisted); a draft or
 * private recipe is logged at warn (`{ slug, visibility }`) and answered like an unknown slug.
 * Appends `?from=qr` so that scans of delisted recipes show a dedicated
 * "no longer available" page instead of a generic 404.
 *
 * @param slug - Recipe slug to generate QR for
 * @param format - 'png' or 'svg'
 * @param baseUrl - Frontend base URL for constructing the full recipe URL
 * @throws RECIPE_NOT_FOUND if the recipe is unknown, soft-deleted, draft or private
 */
export async function getRecipeQRCode(slug: string, format: 'png' | 'svg', baseUrl: string) {
  log.debug({ slug, format }, 'getRecipeQRCode started');
  const recipe = await model.findBySlug(slug);
  if (!recipe) {
    const err = new Error('RECIPE_NOT_FOUND');
    log.error({ err, slug }, 'getRecipeQRCode failed: recipe not found');
    throw err;
  }
  if (!canViewRecipe(recipe, null)) {
    log.warn(
      { slug, visibility: recipe.visibility },
      'getRecipeQRCode failed: recipe not viewable',
    );
    throw new Error('RECIPE_NOT_FOUND');
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
