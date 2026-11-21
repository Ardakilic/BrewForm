import { CollectionCreateSchema, type CollectionListItemOutput } from '@brewform/shared/schemas';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { collectionApi } from '../../api/index.ts';
import { type ActionFailure, formString, toActionFailure } from '../action-result.ts';
import { withDataLog } from '../data-logging.ts';

const log = createLogger('resources/collections');

/** The resource-route path of {@link myCollectionsLoader} and {@link myCollectionsAction}. */
export const MY_COLLECTIONS_PATH = '/resources/collections/mine';

/**
 * The {@link myCollectionsLoader} URL for recipe `recipeId`: each listed collection then carries
 * `containsRecipe` for that recipe.
 */
export function myCollectionsPath(recipeId: string): string {
  return `${MY_COLLECTIONS_PATH}?${new URLSearchParams({ recipeId })}`;
}

/** The intents {@link myCollectionsAction} accepts. */
export type MyCollectionsIntent = 'add' | 'remove' | 'create';

/** Result of {@link myCollectionsLoader}: the signed-in user's collections, or the failure. */
export type MyCollectionsResult =
  | { ok: true; collections: CollectionListItemOutput[] }
  | ActionFailure;

/**
 * Result of {@link myCollectionsAction}. Every result echoes the submitted `intent` (`''` when
 * it was missing or unknown) so the modal knows what to settle or roll back:
 *
 * - `add` / `remove` succeed with the collection's new membership (`containsRecipe`);
 * - `create` succeeds with the new collection's id once the recipe is in it;
 * - a failure carries `collectionId` for `add`/`remove`, and for `create` only when the
 *   collection was created but adding the recipe to it failed.
 */
export type MyCollectionsActionResult =
  | { ok: true; intent: 'add' | 'remove'; collectionId: string; containsRecipe: boolean }
  | { ok: true; intent: 'create'; collectionId: string }
  | (ActionFailure & { intent: MyCollectionsIntent | ''; collectionId?: string });

/** A validation failure for `intent`, returned without calling the API. */
function invalid(
  intent: MyCollectionsIntent,
  error: string,
): ActionFailure & { intent: MyCollectionsIntent } {
  return { ok: false, intent, error, code: 'VALIDATION_ERROR' };
}

/**
 * Never revalidate the collections list after other submissions (a like must not refetch it):
 * `AddToCollectionModal` applies its own action results and reloads the list explicitly with
 * `fetcher.load()` when it opens and after a create.
 */
export function shouldRevalidateMyCollections(): boolean {
  return false;
}

/**
 * `resources/collections/mine` loader for `AddToCollectionModal`: the signed-in user's
 * collections (`GET /collections`, forwarding `?recipeId` so each row carries
 * `containsRecipe`) read through `useFetcher().load()` with `request.signal`. Returns
 * `{ ok: true, collections }` or `{ ok: false, error }` (logged): the modal shows its own error
 * state, so a failure, a 401 included, never reaches an error boundary or redirects (a
 * redirect target would be this resource path). An aborted request rethrows. Logs carry the
 * recipe id only.
 */
export async function myCollectionsLoader({
  request,
}: Pick<LoaderFunctionArgs, 'request'>): Promise<MyCollectionsResult> {
  const recipeId = new URL(request.url).searchParams.get('recipeId') ?? '';
  try {
    const res = await withDataLog(log, 'myCollectionsLoad', { recipeId }, () =>
      collectionApi.list(recipeId ? { recipeId } : undefined, { signal: request.signal }),
    );
    return { ok: true, collections: res.data };
  } catch (err) {
    return toActionFailure(err, []);
  }
}

/**
 * `resources/collections/mine` action, submitted by `AddToCollectionModal` with
 * `fetcher.submit` (url-encoded fields):
 *
 * - `add` (`collectionId`, `recipeId`) → `collectionApi.addRecipe`;
 * - `remove` (`collectionId`, `recipeId`) → `collectionApi.removeRecipe`;
 * - `create` (`name`, `visibility`, `recipeId`) → `collectionApi.create`, validated with the
 *   shared `CollectionCreateSchema` first, then `collectionApi.addRecipe` on the new collection.
 *
 * Returns a {@link MyCollectionsActionResult} and never throws for an API failure (a 401 or a
 * 409 included): the modal toasts and rolls back, except that a 409 `CONFLICT` on `add` (the
 * recipe is already there) keeps the membership. An aborted request rethrows. Logs entry, exit
 * and failure with the intent and ids only, never the collection name.
 */
export async function myCollectionsAction({
  request,
}: Pick<ActionFunctionArgs, 'request'>): Promise<MyCollectionsActionResult> {
  const form = await request.formData();
  const intent = formString(form, 'intent');
  const recipeId = formString(form, 'recipeId');
  const opts = { signal: request.signal };

  if (intent === 'add' || intent === 'remove') {
    const collectionId = formString(form, 'collectionId');
    if (!collectionId || !recipeId)
      return invalid(intent, 'A collection and a recipe are required');
    const ids = { intent, collectionId, recipeId };
    try {
      if (intent === 'add') {
        await withDataLog(log, 'myCollectionsAdd', ids, () =>
          collectionApi.addRecipe(collectionId, recipeId, opts),
        );
      } else {
        await withDataLog(log, 'myCollectionsRemove', ids, () =>
          collectionApi.removeRecipe(collectionId, recipeId, opts),
        );
      }
      return { ok: true, intent, collectionId, containsRecipe: intent === 'add' };
    } catch (err) {
      return { ...toActionFailure(err, []), intent, collectionId };
    }
  }

  if (intent === 'create') {
    const parsed = CollectionCreateSchema.safeParse({
      name: formString(form, 'name').trim(),
      visibility: formString(form, 'visibility') || undefined,
    });
    if (!parsed.success || !recipeId) return invalid(intent, 'Invalid collection');
    const body = { name: parsed.data.name, visibility: parsed.data.visibility };
    let collectionId: string;
    try {
      const created = await withDataLog(log, 'myCollectionsCreate', { intent, recipeId }, () =>
        collectionApi.create(body, opts),
      );
      collectionId = created.id;
    } catch (err) {
      return { ...toActionFailure(err, []), intent };
    }
    try {
      await withDataLog(log, 'myCollectionsCreateAdd', { intent, collectionId, recipeId }, () =>
        collectionApi.addRecipe(collectionId, recipeId, opts),
      );
      return { ok: true, intent, collectionId };
    } catch (err) {
      return { ...toActionFailure(err, []), intent, collectionId };
    }
  }

  log.error({ intent }, 'myCollectionsAction unknown intent');
  return { ok: false, intent: '', error: `Unknown intent: ${intent || '(none)'}` };
}

/** JSON body of the `collections/:id/reorder` resource action. */
export interface CollectionReorderInput {
  itemIds: string[];
}

/** Result of {@link reorderAction}. */
export type CollectionReorderResult = { ok: true } | ActionFailure;

/**
 * `collections/:id/reorder` resource action (PATCH, JSON `{ itemIds }`): persists the new item
 * order through `collectionApi.reorder` with `request.signal`. Returns `{ ok: true }` or
 * `{ ok: false, error, code }` so `CollectionRecipeList` can roll its optimistic order back; a
 * final 401 returns `{ ok: false, code: 'UNAUTHORIZED' }`, because a resource route never
 * redirects. An aborted request rethrows. Logs carry the collection id and item count only.
 */
export async function reorderAction({
  params,
  request,
}: Pick<ActionFunctionArgs, 'params' | 'request'>): Promise<CollectionReorderResult> {
  const collectionId = params.id ?? '';
  const { itemIds } = (await request.json()) as CollectionReorderInput;
  try {
    await withDataLog(log, 'collectionReorder', { collectionId, itemCount: itemIds.length }, () =>
      collectionApi.reorder(collectionId, itemIds, { signal: request.signal }),
    );
    return { ok: true };
  } catch (err) {
    return toActionFailure(err, []);
  }
}
