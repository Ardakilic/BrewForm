import { useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import {
  type RecipeNoteIntent,
  type recipeNoteAction,
  type recipeNoteLoader,
  recipeNotePath,
} from '../../routes/resources/recipe-notes.ts';
import { createLogger } from '../../utils/logger.ts';

const log = createLogger('RecipeNotesSection');

/** Maximum private-note length, matching the shared `RecipeNotesSchema` and the DB CHECK. */
export const MAX_PRIVATE_NOTE_LENGTH = 10000;

/** How long the transient "saved" / "deleted" confirmation stays visible, in ms. */
const STATUS_VISIBLE_MS = 2000;

/** Props for {@link RecipeNotesSection}. */
interface RecipeNotesSectionProps {
  recipeId: string;
}

/** Load state of the viewer's note: in flight, applied to the editor, or failed. */
type LoadPhase = 'loading' | 'ready' | 'failed';

/**
 * The signed-in viewer's own private notes on a recipe ("My private notes"), separate from the
 * author's public brewer notes, which `TastingNotesSection` shows read-only.
 *
 * The note is read with `useFetcher().load()` from the `resources/recipes/:id/notes` resource
 * route (caller-scoped `GET /recipes/:id/notes`), never pre-filled from the recipe payload.
 * Save and Delete submit intents `save` / `delete` to that route's action (`PUT` / `DELETE
 * /recipes/:id/notes`) with `defaultShouldRevalidate: false`, so neither re-runs the recipe
 * detail loader; the editor applies the returned note itself. A failed load shows
 * `recipe.notes.loadError` with Retry and keeps the editor disabled (so a save cannot replace a
 * note the viewer has not seen); a failed save or delete shows `recipe.notes.saveError` and
 * keeps the typed text. Delete is offered only when a note exists. Printing prints only the
 * viewer's saved note, and the whole card is hidden in print when there is none. Renders
 * nothing, and sends no request, for an anonymous viewer.
 */
export function RecipeNotesSection({ recipeId }: RecipeNotesSectionProps) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const loadFetcher = useFetcher<typeof recipeNoteLoader>();
  const writeFetcher = useFetcher<typeof recipeNoteAction>();
  const { load } = loadFetcher;

  const [text, setText] = useState('');
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [phase, setPhase] = useState<LoadPhase>('loading');
  const [writeFailed, setWriteFailed] = useState(false);
  const [status, setStatus] = useState<'saved' | 'deleted' | null>(null);
  const pendingIntent = useRef<RecipeNoteIntent | null>(null);

  useEffect(() => {
    log.debug({ recipeId }, 'RecipeNotesSection mounted');
    return () => {
      log.debug({ recipeId }, 'RecipeNotesSection unmounted');
    };
  }, [recipeId]);

  // Load (or reload, for a different recipe) the viewer's own note.
  useEffect(() => {
    if (!isAuthenticated) return;
    setText('');
    setSavedNote(null);
    setPhase('loading');
    setWriteFailed(false);
    setStatus(null);
    log.debug({ recipeId }, 'RecipeNotesSection loading note');
    void load(recipeNotePath(recipeId));
  }, [isAuthenticated, load, recipeId]);

  // Apply a finished load. Deliberately keyed on the fetcher only (not `recipeId`): after a
  // recipe change the previous recipe's result must not be re-applied while the new load runs.
  // The resource loader already logs failures with the recipe id.
  useEffect(() => {
    if (loadFetcher.state !== 'idle' || !loadFetcher.data) return;
    const result = loadFetcher.data;
    if (!result.ok) {
      log.debug({ code: result.code }, 'RecipeNotesSection load failed');
      setPhase('failed');
      return;
    }
    setText(result.note.notes ?? '');
    setSavedNote(result.note.notes);
    setPhase('ready');
  }, [loadFetcher.state, loadFetcher.data]);

  // Apply a finished save or delete (only one this editor submitted).
  useEffect(() => {
    if (writeFetcher.state !== 'idle' || !writeFetcher.data || !pendingIntent.current) return;
    const intent = pendingIntent.current;
    pendingIntent.current = null;
    const result = writeFetcher.data;
    if (!result.ok) {
      // Keep the typed text so the viewer can retry.
      log.debug({ intent, code: result.code }, 'RecipeNotesSection write failed');
      setWriteFailed(true);
      return;
    }
    log.debug(
      { recipeId: result.note.recipeId, intent, hasNote: result.note.notes !== null },
      'RecipeNotesSection write settled',
    );
    setSavedNote(result.note.notes);
    setText(result.note.notes ?? '');
    setStatus(intent === 'delete' ? 'deleted' : 'saved');
  }, [writeFetcher.state, writeFetcher.data]);

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), STATUS_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [status]);

  if (!isAuthenticated) return null;

  const busy = writeFetcher.state !== 'idle';
  const ready = phase === 'ready';

  /** Submits `intent` (with the note text for `save`) to the notes resource action. */
  function submit(intent: RecipeNoteIntent) {
    if (!ready || busy) return;
    log.debug({ recipeId, intent }, 'RecipeNotesSection submit');
    pendingIntent.current = intent;
    setWriteFailed(false);
    setStatus(null);
    writeFetcher.submit(intent === 'save' ? { intent, notes: text } : { intent }, {
      method: 'post',
      action: recipeNotePath(recipeId),
      defaultShouldRevalidate: false,
    });
  }

  /** Re-requests the note after a failed load. */
  function retryLoad() {
    log.debug({ recipeId }, 'RecipeNotesSection retrying load');
    setPhase('loading');
    void load(recipeNotePath(recipeId));
  }

  const label = t('recipe.myNotes');

  return (
    <section className={`card${savedNote === null ? ' print-hidden' : ''}`} aria-label={label}>
      <div className="mb-4">
        <h2
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {label}
        </h2>
        <p className="text-xs mt-1 print-hidden" style={{ color: 'var(--text-tertiary)' }}>
          {t('recipe.myNotes.hint')}
        </p>
      </div>
      {phase === 'failed' && (
        <div className="flex items-center justify-between gap-2 mb-3 print-hidden">
          <p role="alert" className="text-sm" style={{ color: 'var(--error)' }}>
            {t('recipe.notes.loadError')}
          </p>
          <button type="button" onClick={retryLoad} className="btn-secondary text-sm min-h-11 px-4">
            {t('common.retry')}
          </button>
        </div>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('recipe.myNotes.placeholder')}
        className="input-field text-sm w-full min-h-[120px] resize-y print-hidden"
        maxLength={MAX_PRIVATE_NOTE_LENGTH}
        disabled={!ready || busy}
        aria-label={label}
      />
      {savedNote !== null && (
        <p className="print-only whitespace-pre-wrap text-sm" style={{ lineHeight: '1.6' }}>
          {savedNote}
        </p>
      )}
      {writeFailed && (
        <p role="alert" className="text-sm mt-2 print-hidden" style={{ color: 'var(--error)' }}>
          {t('recipe.notes.saveError')}
        </p>
      )}
      <div className="flex items-center justify-between mt-3 print-hidden">
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {text.length} / {MAX_PRIVATE_NOTE_LENGTH}
        </span>
        <div className="flex items-center gap-2">
          <span role="status" className="text-xs" style={{ color: 'var(--accent-primary)' }}>
            {status === 'saved' && t('recipe.notes.saved')}
            {status === 'deleted' && t('recipe.notes.deleted')}
          </span>
          {savedNote !== null && (
            <button
              type="button"
              onClick={() => submit('delete')}
              disabled={!ready || busy}
              className="btn-secondary text-sm min-h-11 px-4"
            >
              {t('recipe.notes.delete')}
            </button>
          )}
          <button
            type="button"
            onClick={() => submit('save')}
            disabled={!ready || busy || text.trim().length === 0}
            className="btn-primary text-sm min-h-11 px-4"
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </section>
  );
}
