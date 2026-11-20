import { useEffect, useRef } from 'react';
import { useToast } from '../components/ui/Toast.tsx';

/** The minimal fetcher shape this hook watches (`useFetcher()` satisfies it). */
interface WatchedFetcher<D> {
  state: 'idle' | 'loading' | 'submitting';
  data: D | undefined;
}

/** Options for {@link useActionFeedback}. */
export interface ActionFeedbackOptions<D> {
  /** i18n key toasted when the action returns `{ ok: false }`. */
  errorKey?: string | ((data: D) => string);
  /** i18n key toasted when the action returns `{ ok: true }`. */
  successKey?: string | ((data: D) => string);
  /** Called once per completed submission that returned `{ ok: true }`. */
  onSuccess?: (data: D) => void;
  /** Called once per completed submission that returned `{ ok: false }`. */
  onError?: (data: D) => void;
}

/**
 * Turns a fetcher's action results into feedback: when a submission settles (the fetcher goes
 * back to `idle` with data), it toasts `errorKey` for `{ ok: false }` (or `successKey` for
 * `{ ok: true }`) and runs the matching callback exactly once per submission. A non-fetch
 * effect: it only reads fetcher state.
 */
export function useActionFeedback<D extends { ok: boolean }>(
  fetcher: WatchedFetcher<D>,
  options: ActionFeedbackOptions<D>,
): void {
  const toast = useToast();
  // Each completed submission yields a new `data` object; tracking its identity (rather than a
  // submitting → idle transition) also catches submissions that settle within one render batch,
  // e.g. a submit issued from a promise continuation after a confirm dialog.
  const handledData = useRef(fetcher.data);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Runs after every commit (no dependency list): a dependency list on `fetcher.data` missed a
  // result that arrived within one render batch, and the identity check makes this cheap.
  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data || fetcher.data === handledData.current) return;
    handledData.current = fetcher.data;
    const { errorKey, successKey, onSuccess, onError } = optionsRef.current;
    const data = fetcher.data;
    if (data.ok) {
      if (successKey)
        toast.success(typeof successKey === 'function' ? successKey(data) : successKey);
      onSuccess?.(data);
    } else {
      if (errorKey) toast.error(typeof errorKey === 'function' ? errorKey(data) : errorKey);
      onError?.(data);
    }
  });
}
