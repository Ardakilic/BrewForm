import type { RecipeDetailOutput } from '@brewform/shared/schemas';
import { ApiError, isAbortError } from '../../api/errors.ts';
import { type RequestOptions, recipeApi } from '../../api/index.ts';
import { type ActionFailure, toActionFailure } from '../../routes/action-result.ts';

/**
 * Loads one recipe by slug or id for a route loader. An API 404 becomes a thrown 404
 * `Response`, so the route's `errorElement` renders the not-found page (and `withDataLog`
 * records no error log for it); every other failure is rethrown unchanged.
 */
export async function getRecipeOr404(
  slugOrId: string,
  opts: RequestOptions,
): Promise<RecipeDetailOutput> {
  try {
    return await recipeApi.get(slugOrId, opts);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      throw new Response('Not Found', { status: 404 });
    }
    throw err;
  }
}

/** Per-field validation messages an API `VALIDATION_ERROR` carries. */
export type FieldErrorDetail = { field: string; message: string };

/** Expected failure of a recipe form action: the action failure plus any field details. */
export interface RecipeFormFailure extends ActionFailure {
  details?: FieldErrorDetail[];
}

/**
 * Converts an error caught in a recipe form action (create, update, fork, merge) into
 * `{ ok: false, error, code?, details? }`. Field-level `details` of an API validation error
 * are kept so the form can list them. A rejection that is not an `Error` carries an empty
 * `error`, so the page shows its own fallback message. Aborts and 401s are rethrown (the
 * router and `requireAuth` handle them), exactly as {@link toActionFailure} does.
 */
export function toRecipeFormFailure(err: unknown): RecipeFormFailure {
  if (!(err instanceof Error) && !isAbortError(err)) return { ok: false, error: '' };
  const failure = toActionFailure(err);
  if (err instanceof ApiError && err.details && err.details.length > 0) {
    return { ...failure, details: err.details };
  }
  return failure;
}
