import type { RecipeUserNoteOutput } from '@brewform/shared/schemas';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { recipeApi } from '../../api/index.ts';
import { type ActionFailure, formString, toActionFailure } from '../action-result.ts';
import { withDataLog } from '../data-logging.ts';

const log = createLogger('resources/recipe-notes');

/** The intents {@link recipeNoteAction} accepts. */
export type RecipeNoteIntent = 'save' | 'delete';

/** The resource-route path of {@link recipeNoteLoader} / {@link recipeNoteAction} for a recipe. */
export function recipeNotePath(recipeId: string): string {
  return `/resources/recipes/${encodeURIComponent(recipeId)}/notes`;
}

/**
 * Result of {@link recipeNoteLoader} and {@link recipeNoteAction}: the caller's own private
 * note (`note.notes` is `null` when there is none, including right after a delete), or the
 * failure.
 */
export type RecipeNoteResult = { ok: true; note: RecipeUserNoteOutput } | ActionFailure;

/**
 * `resources/recipes/:id/notes` loader: the signed-in caller's own private note on recipe
 * `:id`, read by `RecipeNotesSection` through `useFetcher().load()` with `request.signal`.
 * Returns `{ ok: true, note }` or `{ ok: false, error }`: the private note is supplementary to
 * the recipe page, so a failure (including a 401 or 404) never reaches an error boundary. An
 * aborted request is rethrown for the router. Logs carry the recipe id only, never note text.
 */
export async function recipeNoteLoader({
  params,
  request,
}: LoaderFunctionArgs): Promise<RecipeNoteResult> {
  const recipeId = params.id ?? '';
  try {
    const note = await withDataLog(log, 'recipeNoteLoad', { recipeId }, () =>
      recipeApi.getMyNote(recipeId, { signal: request.signal }),
    );
    return { ok: true, note };
  } catch (err) {
    return toActionFailure(err, []);
  }
}

/**
 * `resources/recipes/:id/notes` action, submitted by `RecipeNotesSection` with
 * `fetcher.submit`. Intent `save` (field `notes`) creates or replaces the caller's private
 * note with `PUT /recipes/:id/notes`; intent `delete` removes it with
 * `DELETE /recipes/:id/notes`. Returns `{ ok: true, note }` or `{ ok: false, error }` and never
 * throws for an API failure (a 401 included), so the editor keeps the typed text and shows the
 * error; an aborted request is rethrown. Logs entry, exit and failure with the recipe id, the
 * intent and the note length only, never the note text.
 */
export async function recipeNoteAction({
  params,
  request,
}: ActionFunctionArgs): Promise<RecipeNoteResult> {
  const recipeId = params.id ?? '';
  const form = await request.formData();
  const intent = formString(form, 'intent');
  const opts = { signal: request.signal };
  try {
    if (intent === 'save') {
      const notes = formString(form, 'notes');
      const note = await withDataLog(
        log,
        'recipeNoteSave',
        { recipeId, intent, noteLength: notes.length },
        () => recipeApi.saveMyNote(recipeId, { notes }, opts),
      );
      return { ok: true, note };
    }
    if (intent === 'delete') {
      const note = await withDataLog(log, 'recipeNoteDelete', { recipeId, intent }, () =>
        recipeApi.deleteMyNote(recipeId, opts),
      );
      return { ok: true, note };
    }
    log.error({ recipeId, intent }, 'recipeNoteAction unknown intent');
    return { ok: false, error: `Unknown intent: ${intent || '(none)'}` };
  } catch (err) {
    return toActionFailure(err, []);
  }
}

/**
 * `shouldRevalidate` for the notes resource route: the private note changes only through its
 * own action, whose result the editor applies directly, so no submission (including a note
 * save) re-runs the loaded note.
 */
export function shouldRevalidateRecipeNote(): boolean {
  return false;
}
