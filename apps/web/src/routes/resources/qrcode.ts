import type { LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { qrcodeApi } from '../../api/index.ts';
import { type ActionFailure, toActionFailure } from '../action-result.ts';
import { withDataLog } from '../data-logging.ts';

const log = createLogger('resources/qrcode');

/** The resource-route path of {@link recipeQrLoader} for recipe `slug`. */
export function recipeQrPath(slug: string): string {
  return `/resources/qrcode/recipe/${encodeURIComponent(slug)}`;
}

/** Result of {@link recipeQrLoader}: the recipe's QR-code SVG text, or the failure. */
export type RecipeQrResult = { ok: true; svg: string } | ActionFailure;

/**
 * Never revalidate the QR-code resource loader after actions: its fetcher data triggers a file
 * download, so a revalidation (after a like, a comment, …) would download the SVG again. The
 * download hook loads it explicitly with `fetcher.load()` on each click.
 */
export function shouldRevalidateRecipeQr(): boolean {
  return false;
}

/**
 * `resources/qrcode/recipe/:slug` loader for the QR-code download (`useRecipeQrDownload`,
 * through `useFetcher().load()`). Reads the SVG with `qrcodeApi.recipeSvg(slug, { signal })`
 * and returns `{ ok: true, svg }`, or `{ ok: false, error }` instead of throwing, so the hook
 * can toast `qrcode.downloadFailed` without replacing the page. Logs entry, exit and failure
 * with the slug only; an aborted request rethrows.
 */
export async function recipeQrLoader({
  params,
  request,
}: Pick<LoaderFunctionArgs, 'params' | 'request'>): Promise<RecipeQrResult> {
  const slug = params.slug ?? '';
  try {
    const svg = await withDataLog(log, 'recipeQr', { slug }, () =>
      qrcodeApi.recipeSvg(slug, { signal: request.signal }),
    );
    return { ok: true, svg };
  } catch (err) {
    return toActionFailure(err, []);
  }
}
