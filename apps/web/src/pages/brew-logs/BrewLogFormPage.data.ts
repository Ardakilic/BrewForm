import type {
  BrewLogCreate,
  BrewLogOutput,
  BrewLogUpdate,
  RecipeDetailOutput,
} from '@brewform/shared/schemas';
import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { ApiError } from '../../api/errors.ts';
import { brewLogApi, recipeApi } from '../../api/index.ts';
import type { BrewLogFormValues } from '../../components/brew-log/BrewLogForm.tsx';
import { type ActionFailure, toActionFailure } from '../../routes/action-result.ts';
import { requireAuth } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';

const log = createLogger('BrewLogFormPage');

/** Where the form goes after a save, and where a missing or foreign log redirects. */
export const BREW_LOG_LIST_PATH = '/brew-logs';

/** Loader payload for `BrewLogFormPage` — serves both create and edit routes. */
export interface BrewLogFormLoaderData {
  mode: 'create' | 'edit';
  logId?: string;
  editLog?: BrewLogOutput;
  recipe?: RecipeDetailOutput;
  recipeId?: string;
  recipeVersionId?: string;
}

/**
 * `/brew-logs/new` and `/brew-logs/:id/edit` loader. Create mode requires `?recipeId`
 * (redirects to `/brew-logs` without it) and fetches the recipe to prefill dose/yield from the
 * version. Edit mode fetches the existing log (the API rejects non-owners with 404); a 404
 * redirects to `/brew-logs`, a final 401 redirects to `/login?next=…` (`requireAuth`), and any
 * other error propagates to the route error element. Every request carries `request.signal`.
 */
export const loader = requireAuth(
  async ({
    params,
    request,
  }: Pick<LoaderFunctionArgs, 'params' | 'request'>): Promise<BrewLogFormLoaderData> => {
    const opts = { signal: request.signal };
    const logId = params.id;
    if (logId) {
      const editLog = await withDataLog(log, 'BrewLogFormPage loadBrewLog', { logId }, async () => {
        try {
          return await brewLogApi.get(logId, opts);
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            log.debug({ logId, status: err.status }, 'BrewLogFormPage edit loader redirecting');
            throw redirect(BREW_LOG_LIST_PATH);
          }
          throw err;
        }
      });
      return { mode: 'edit', logId, editLog };
    }
    const url = new URL(request.url);
    const recipeId = url.searchParams.get('recipeId');
    if (!recipeId) {
      log.debug({}, 'BrewLogFormPage create loader missing recipeId, redirecting');
      throw redirect(BREW_LOG_LIST_PATH);
    }
    const recipeVersionId = url.searchParams.get('recipeVersionId') ?? undefined;
    const recipe = await withDataLog(
      log,
      'BrewLogFormPage loadRecipe',
      { recipeId, recipeVersionId },
      () => recipeApi.get(recipeId, opts),
    );
    return { mode: 'create', recipe, recipeId, recipeVersionId };
  },
);

/**
 * JSON body submitted to the brew-log form action: the validated form values plus, in create
 * mode, the recipe (and optional version) the brew belongs to.
 */
export interface BrewLogFormActionInput {
  values: BrewLogFormValues;
  recipeId?: string;
  recipeVersionId?: string;
}

/** Result of the brew-log form action. */
export type BrewLogFormActionResult =
  | { ok: true; mode: 'create' | 'edit' }
  | (ActionFailure & { mode: 'create' | 'edit' });

/** Maps form values to the `PATCH /brew-logs/:id` body (cleared fields are sent as `null`). */
function toBrewLogUpdate(values: BrewLogFormValues): BrewLogUpdate {
  return {
    brewedAt: values.brewedAt,
    yieldActual: values.yieldActual,
    doseActual: values.doseActual,
    notes: values.notes,
    personalRating: values.personalRating,
  };
}

/** Maps form values to the `POST /brew-logs` body (empty optional fields are omitted). */
function toBrewLogCreate(
  values: BrewLogFormValues,
  recipeId: string,
  recipeVersionId: string | undefined,
): BrewLogCreate {
  return {
    recipeId,
    recipeVersionId,
    brewedAt: values.brewedAt,
    yieldActual: values.yieldActual ?? undefined,
    doseActual: values.doseActual ?? undefined,
    notes: values.notes ?? undefined,
    personalRating: values.personalRating ?? undefined,
  };
}

/**
 * `/brew-logs/new` and `/brew-logs/:id/edit` action (JSON {@link BrewLogFormActionInput}):
 * updates log `:id` in edit mode, otherwise creates a log for `recipeId`. Returns
 * `{ ok: true, mode }` (the page then navigates to `/brew-logs`) or `{ ok: false, mode, error }`
 * (the page toasts and keeps the typed values); a final 401 redirects through `requireAuth`.
 */
export const action = requireAuth(
  async ({ params, request }: ActionFunctionArgs): Promise<BrewLogFormActionResult> => {
    const input = (await request.json()) as BrewLogFormActionInput;
    const opts = { signal: request.signal };
    const logId = params.id;
    const mode = logId ? 'edit' : 'create';
    try {
      if (logId) {
        await withDataLog(log, 'BrewLogFormPage updateBrewLog', { logId }, () =>
          brewLogApi.update(logId, toBrewLogUpdate(input.values), opts),
        );
        return { ok: true, mode };
      }
      const { recipeId, recipeVersionId } = input;
      if (!recipeId) return { ok: false, mode, error: 'Missing recipe id' };
      await withDataLog(log, 'BrewLogFormPage createBrewLog', { recipeId, recipeVersionId }, () =>
        brewLogApi.create(toBrewLogCreate(input.values, recipeId, recipeVersionId), opts),
      );
      return { ok: true, mode };
    } catch (err) {
      return { ...toActionFailure(err), mode };
    }
  },
);
