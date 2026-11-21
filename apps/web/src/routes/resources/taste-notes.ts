import type { TasteNoteOutput } from '@brewform/shared/schemas';
import type { LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { getTasteNotesCached } from '../../api/static-cache.ts';
import { type ActionFailure, toActionFailure } from '../action-result.ts';
import { withDataLog } from '../data-logging.ts';

const log = createLogger('resources/taste-notes');

/** The resource-route path of {@link tasteNotesLoader}. */
export const TASTE_NOTES_PATH = '/resources/taste-notes';

/** Result of {@link tasteNotesLoader}. */
export type TasteNotesResult = { ok: true; notes: TasteNoteOutput[] } | ActionFailure;

/**
 * `resources/taste-notes` loader: the flat taste-note list (read by `TasteAutocomplete`
 * through a fetcher), served by the single-flight static cache (`getTasteNotesCached`) with
 * `request.signal`. Returns `{ ok: true, notes }` or `{ ok: false, error }` so a failure never
 * replaces the surrounding form with an error boundary. An abort is rethrown.
 */
export async function tasteNotesLoader({ request }: LoaderFunctionArgs): Promise<TasteNotesResult> {
  try {
    const notes = await withDataLog(log, 'tasteNotes', {}, () =>
      getTasteNotesCached({ signal: request.signal }),
    );
    return { ok: true, notes };
  } catch (err) {
    return toActionFailure(err, []);
  }
}

/**
 * Revalidation policy of `resources/taste-notes`: never re-run after an action. The list is
 * static lookup data; taste-note mutations invalidate the static cache, and the next mount of
 * a `TasteAutocomplete` loads the fresh list.
 */
export function shouldRevalidateTasteNotes(): boolean {
  return false;
}
