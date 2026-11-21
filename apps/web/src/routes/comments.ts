import type { CommentOutput } from '@brewform/shared/schemas';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { isAbortError } from '../api/errors.ts';
import { commentApi } from '../api/index.ts';
import { type ActionFailure, formString, toActionFailure } from './action-result.ts';
import { withDataLog } from './data-logging.ts';

const logger = createLogger('comments');

/**
 * Route loader for the `comments/recipe/:recipeId` resource route. Handles
 * GET requests issued by `useFetcher().load()` when the user clicks "Load
 * More" in `CommentSection`. Extracts `recipeId` from path params and
 * `page` from the `?page=N` query string, then delegates to
 * `commentApi.list()` to fetch the next page of comments.
 *
 * The loader returns the full `PaginatedResponse<CommentWithRepliesOutput>`
 * wrapper (not a bare array) so `CommentSection` can append `result.data` and
 * read `result.meta.pagination` from the fetcher's data without a second fetch.
 *
 * Registered on the same route object as `createCommentAction` — React
 * Router dispatches GET to this loader and POST to the action. The request
 * carries `request.signal`, so a superseded "Load More" aborts it; entry,
 * exit and failure are logged with the ids only.
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
  const parsed = pageParam ? parseInt(pageParam, 10) : 1;
  const page = Number.isNaN(parsed) ? 1 : parsed;
  return withDataLog(logger, 'listCommentsLoader', { recipeId, page }, () =>
    commentApi.list(recipeId, page, { signal: request.signal }),
  );
};

/** Result of {@link createCommentAction}: the created comment, or an expected failure. */
export type CreateCommentResult = { ok: true; comment: CommentOutput } | ActionFailure;

/** Result of {@link deleteCommentAction}. */
export type DeleteCommentResult = { ok: true } | ActionFailure;

/**
 * Action for posting a comment (or a reply via `parentCommentId`) on
 * `comments/recipe/:recipeId`. Returns `{ ok: true, comment }`, or `{ ok: false, error, code? }`
 * for empty content and every API failure (including 401 and rate limits), so the recipe page
 * stays rendered and `CommentSection` keeps the typed text and toasts the error. Entry, exit
 * and failure are logged with ids only (never the comment text).
 *
 * @throws {Response} 400 only when the route is mis-wired without a `recipeId` param.
 */
export const createCommentAction = async ({
  params,
  request,
}: ActionFunctionArgs): Promise<CreateCommentResult> => {
  const recipeId = params.recipeId;
  if (typeof recipeId !== 'string' || recipeId.length === 0) {
    throw new Response('Missing recipe id', { status: 400 });
  }
  const form = await request.formData();
  const content = formString(form, 'content').trim();
  if (content === '') {
    return { ok: false, error: 'Comment content is required' };
  }
  const parentCommentId = formString(form, 'parentCommentId') || undefined;

  logger.debug(
    { recipeId, hasParentCommentId: Boolean(parentCommentId) },
    'createCommentAction started',
  );
  try {
    const comment = await commentApi.create(
      recipeId,
      { content, ...(parentCommentId ? { parentCommentId } : {}) },
      { signal: request.signal },
    );
    logger.debug({ recipeId, commentId: comment.id }, 'createCommentAction completed');
    return { ok: true, comment };
  } catch (err: unknown) {
    if (!isAbortError(err)) logger.error({ err, recipeId }, 'createCommentAction failed');
    return toActionFailure(err, []);
  }
};

/**
 * Action for deleting comment `:id`. Returns `{ ok: true }`, or `{ ok: false, error, code? }`
 * for every API failure, so `CommentSection` can restore its optimistic removal from the
 * snapshot and toast the error instead of the page being replaced by an error boundary.
 *
 * @throws {Response} 400 only when the route is mis-wired without an `id` param.
 */
export const deleteCommentAction = async ({
  params,
  request,
}: ActionFunctionArgs): Promise<DeleteCommentResult> => {
  const id = params.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Response('Missing or invalid comment id', { status: 400 });
  }

  logger.debug({ id }, 'deleteCommentAction started');
  try {
    await commentApi.delete(id, { signal: request.signal });
    logger.debug({ id }, 'deleteCommentAction completed');
    return { ok: true };
  } catch (err: unknown) {
    if (!isAbortError(err)) logger.error({ err, id }, 'deleteCommentAction failed');
    return toActionFailure(err, []);
  }
};
