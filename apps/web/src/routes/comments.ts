import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { commentApi } from '../api/index.ts';
import { createLogger } from '@/utils/logger.ts';

const logger = createLogger('comments');

/**
 * Route loader for the `comments/recipe/:recipeId` resource route. Handles
 * GET requests issued by `useFetcher().load()` when the user clicks "Load
 * More" in `CommentSection`. Extracts `recipeId` from path params and
 * `page` from the `?page=N` query string, then delegates to
 * `commentApi.list()` to fetch the next page of comments.
 *
 * The loader returns the full `PaginatedResponse<CommentData>` wrapper
 * (not a bare `CommentData[]`) so the `useEffect` at
 * `CommentSection.tsx:171-181` can destructure both `result.data` and
 * `result.meta.pagination` without a second fetch.
 *
 * Registered on the same route object as `createCommentAction` — React
 * Router dispatches GET to this loader and POST to the action.
 *
 * @throws {Response} 400 with body `'Missing recipe id'` when `params.recipeId`
 *   is not a non-empty string.
 */
export const listCommentsLoader = async ({ params, request }: LoaderFunctionArgs) => {
  const recipeId = params.recipeId;
  if (typeof recipeId !== 'string' || recipeId.length === 0) {
    throw new Response('Missing recipe id', { status: 400 });
  }
  const url = new URL(request.url);
  const pageParam = url.searchParams.get('page');
  const page = pageParam ? parseInt(pageParam, 10) : 1;
  logger.debug({ recipeId, page }, 'listCommentsLoader started');
  return commentApi.list(recipeId, isNaN(page) ? 1 : page);
};

/**
 * Action for posting a comment (or reply via `parentCommentId`) on
 * `comments/recipe/:recipeId`. Returns the created comment; throws a
 * 400 Response for missing content or recipe id.
 */
export const createCommentAction = async ({ params, request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const rawContent = form.get('content');
  if (typeof rawContent !== 'string' || rawContent.trim() === '') {
    throw new Response('Comment content is required', { status: 400 });
  }
  const content = rawContent.trim();
  const recipeId = params.recipeId;
  if (typeof recipeId !== 'string' || recipeId.length === 0) {
    throw new Response('Missing recipe id', { status: 400 });
  }
  const rawParent = form.get('parentCommentId');
  const parentCommentId = typeof rawParent === 'string' && rawParent.length > 0
    ? rawParent
    : undefined;

  logger.debug(
    { recipeId, hasParentCommentId: Boolean(parentCommentId) },
    'createCommentAction started',
  );

  try {
    const created = await commentApi.create(recipeId, {
      content,
      ...(parentCommentId ? { parentCommentId } : {}),
    });
    logger.debug({ recipeId, commentId: created.id }, 'createCommentAction completed');
    return created;
  } catch (err: unknown) {
    logger.error({ err, recipeId }, 'createCommentAction failed');
    throw err;
  }
};

/**
 * Action for deleting comment `:id`. Returns `null` on success; throws
 * a 400 Response when the id is missing. The optimistic removal and
 * rollback live in `CommentSection`.
 */
export const deleteCommentAction = async ({ params }: ActionFunctionArgs) => {
  const id = params.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Response('Missing or invalid comment id', { status: 400 });
  }

  logger.debug({ id }, 'deleteCommentAction started');

  try {
    await commentApi.delete(id);
    logger.debug({ id }, 'deleteCommentAction completed');
    return null;
  } catch (err: unknown) {
    logger.error({ err, id }, 'deleteCommentAction failed');
    throw err;
  }
};
