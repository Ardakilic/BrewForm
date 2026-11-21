import type { ChildLogger } from '@brewform/shared/logger';
import type { CollectionDetailOutput } from '@brewform/shared/schemas';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { ApiError } from '../../api/errors.ts';
import { collectionApi } from '../../api/index.ts';
import { type ActionFailure, formString, toActionFailure } from '../../routes/action-result.ts';
import { requireAuth } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';

const log = createLogger('CollectionDetailPage');

/**
 * Loads one collection for a page loader: a missing id or an API 404 throws a 404 `Response`
 * (the route renders the not-found page, without an error log); any other failure is logged
 * as `<label> failed` and rethrown to the route error state. Passes `signal` to the client.
 */
export function loadCollection(
  logger: ChildLogger,
  label: string,
  id: string | undefined,
  signal: AbortSignal,
): Promise<CollectionDetailOutput> {
  if (!id) throw new Response('Not Found', { status: 404 });
  return withDataLog(logger, label, { collectionId: id }, async () => {
    try {
      return await collectionApi.get(id, { signal });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        throw new Response('Not Found', { status: 404 });
      }
      throw err;
    }
  });
}

/**
 * `/collections/:id` loader: the collection with its items, as `{ collection }`. Public
 * collections load signed out; a missing or hidden collection (API 404) renders the
 * not-found page.
 */
export async function loader({ params, request }: LoaderFunctionArgs) {
  return {
    collection: await loadCollection(
      log,
      'CollectionDetailPage loadCollection',
      params.id,
      request.signal,
    ),
  };
}

/** Result of the `/collections/:id` action. */
export type CollectionDetailActionResult =
  | { ok: true; intent: 'remove'; recipeId: string }
  | (ActionFailure & { intent: string });

/**
 * `/collections/:id` action, keyed by `intent`: `remove` (`recipeId`) removes the recipe from
 * the collection through `collectionApi.removeRecipe`. Returns `{ ok: true, intent, recipeId }`
 * or `{ ok: false, intent, error }`; a final 401 redirects through `requireAuth`. The loader
 * revalidates after a successful removal, so the recipe count follows.
 */
export const action = requireAuth(
  async ({ params, request }: ActionFunctionArgs): Promise<CollectionDetailActionResult> => {
    const form = await request.formData();
    const intent = formString(form, 'intent');
    const collectionId = params.id ?? '';
    const recipeId = formString(form, 'recipeId');
    try {
      if (intent === 'remove') {
        await withDataLog(
          log,
          'CollectionDetailPage removeRecipe',
          { collectionId, recipeId },
          () => collectionApi.removeRecipe(collectionId, recipeId, { signal: request.signal }),
        );
        return { ok: true, intent, recipeId };
      }
      return { ok: false, intent, error: 'Unknown intent' };
    } catch (err) {
      return { ...toActionFailure(err), intent };
    }
  },
);

/** JSON body of the `collections/:id/reorder` resource action. */
export interface CollectionReorderInput {
  itemIds: string[];
}

/** Result of the `collections/:id/reorder` resource action. */
export type CollectionReorderResult = { ok: true } | ActionFailure;

/**
 * `collections/:id/reorder` resource action (PATCH, JSON `{ itemIds }`): persists the new item
 * order through `collectionApi.reorder`. Returns `{ ok: true }` or `{ ok: false, error }` so
 * `CollectionRecipeList` can roll its optimistic order back; a final 401 redirects through
 * `requireAuth`.
 */
export const reorderAction = requireAuth(
  async ({ params, request }: ActionFunctionArgs): Promise<CollectionReorderResult> => {
    const collectionId = params.id ?? '';
    const { itemIds } = (await request.json()) as CollectionReorderInput;
    try {
      await withDataLog(
        log,
        'CollectionDetailPage reorder',
        { collectionId, itemCount: itemIds.length },
        () => collectionApi.reorder(collectionId, itemIds, { signal: request.signal }),
      );
      return { ok: true };
    } catch (err) {
      return toActionFailure(err);
    }
  },
);
