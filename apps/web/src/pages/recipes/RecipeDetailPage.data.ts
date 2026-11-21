import type {
  CommentWithRepliesOutput,
  PaginatedResponse,
  RecipeCollectionsOutput,
  RecipeDetailOutput,
  TasteNoteOutput,
} from '@brewform/shared/schemas';
import { type LoaderFunctionArgs, redirect, type ShouldRevalidateFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { ApiError, isAbortError } from '../../api/errors.ts';
import { collectionApi, commentApi, recipeApi } from '../../api/index.ts';
import { getTasteNotesCached } from '../../api/static-cache.ts';
import { withDataLog } from '../../routes/data-logging.ts';

const log = createLogger('RecipeDetailPage');

/** Where a QR visit to a recipe that no longer resolves lands. */
export const RECIPE_UNAVAILABLE_PATH = '/recipes/unavailable';

/** Loader data for the recipe detail page — recipe, taste notes, comments, and collections. */
export interface DetailLoaderData {
  recipe: RecipeDetailOutput;
  tasteNotes: TasteNoteOutput[];
  comments: PaginatedResponse<CommentWithRepliesOutput>;
  collections: RecipeCollectionsOutput;
}

/**
 * Fetches recipe `slug`. A 404 throws `redirect('/recipes/unavailable')` for a QR visit
 * (`fromQr`, logged at debug) and the 404 `Response` otherwise, so the route renders the
 * not-found page. Every other error is rethrown. A recipe the viewer may open is returned
 * whatever its visibility: an unlisted recipe reached through its QR code renders normally.
 */
async function getRecipeOrNotFound(
  slug: string,
  fromQr: boolean,
  signal: AbortSignal,
): Promise<RecipeDetailOutput> {
  try {
    return await recipeApi.get(slug, { signal });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      if (fromQr) {
        log.debug({ slug }, 'QR visit to unavailable recipe');
        throw redirect(RECIPE_UNAVAILABLE_PATH);
      }
      throw new Response('Not Found', { status: 404 });
    }
    throw err;
  }
}

/**
 * `/recipes/:slug` loader: the recipe (see {@link getRecipeOrNotFound} for the 404 and
 * `?from=qr` handling), then the cached taste-note list, the first comments page and the
 * collections containing the recipe (D99.5/US-9) in parallel. Every request carries
 * `request.signal`. A collections outage degrades to `[]` (logged) instead of failing the page.
 * Returns {@link DetailLoaderData}.
 */
export async function loader({ params, request }: LoaderFunctionArgs): Promise<DetailLoaderData> {
  const slug = params.slug;
  if (!slug) throw new Response('Not Found', { status: 404 });
  const fromQr = new URL(request.url).searchParams.get('from') === 'qr';
  const opts = { signal: request.signal };
  return await withDataLog(log, 'RecipeDetailPage loadRecipe', { slug }, async () => {
    const recipe = await getRecipeOrNotFound(slug, fromQr, request.signal);
    const [tasteNotes, comments, collections] = await Promise.all([
      getTasteNotesCached(opts),
      commentApi.list(recipe.id, 1, opts),
      // A collections outage must not fail the recipe page.
      collectionApi.listByRecipe(recipe.id, opts).catch((err: unknown) => {
        if (isAbortError(err)) throw err;
        log.error({ err, recipeId: recipe.id }, 'RecipeDetailPage loadCollections failed');
        return [] as RecipeCollectionsOutput;
      }),
    ]);
    return { recipe, tasteNotes, comments, collections };
  });
}

/**
 * Submissions whose success leaves the detail loader's data valid: like, favourite, follow,
 * and comment create/delete (the components settle their own UI from the action result).
 * Rating is deliberately absent, because the community average comes from the loader.
 */
const SELF_SETTLING_ACTION_RE =
  /^\/(?:recipes\/[^/]+\/(?:like|favourite)|follow\/[^/]+|comments\/recipe\/[^/]+|comments\/[^/]+)$/;

/**
 * `shouldRevalidate` for `/recipes/:slug`: never re-runs the 3-request detail loader after an
 * action that returned `{ ok: false }` (a failed action changed nothing, and a reload on a
 * network blip could replace the page with the route error), and skips it after a successful
 * like, favourite, follow or comment action (`actionResult.ok === true`), so a like sends
 * exactly one request and loaded comment pages are kept. A successful rating and every
 * navigation fall back to React Router's default.
 */
export function shouldRevalidate({
  formAction,
  actionResult,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs): boolean {
  if (formAction && actionResult?.ok === false) {
    log.debug({ formAction }, 'RecipeDetailPage revalidation skipped after a failed action');
    return false;
  }
  if (formAction && actionResult?.ok === true) {
    const path = new URL(formAction, 'http://localhost').pathname;
    if (SELF_SETTLING_ACTION_RE.test(path)) {
      log.debug({ path }, 'RecipeDetailPage revalidation skipped');
      return false;
    }
  }
  return defaultShouldRevalidate;
}
