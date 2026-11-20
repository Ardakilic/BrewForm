import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { adminApi } from '../../api/index.ts';
import { getTasteNotesCached, invalidateStaticCache } from '../../api/static-cache.ts';
import { formString, toActionFailure } from '../../routes/action-result.ts';
import { requireAdmin } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';

const log = createLogger('AdminTasteNotesPage');

/**
 * `/admin/taste-notes` loader: the flat taste-note list, read through the single-flight static
 * cache (the action invalidates it, so the post-action revalidation re-fetches).
 */
export const loader = requireAdmin(({ request }: LoaderFunctionArgs) =>
  withDataLog(log, 'AdminTasteNotesPage loadData', {}, async () => ({
    notes: await getTasteNotesCached({ signal: request.signal }),
  })),
);

/** Result of the `/admin/taste-notes` action. */
export type AdminTasteNotesActionResult =
  | { ok: true; intent: 'create' | 'delete' }
  | { ok: false; intent: string; error: string; code?: string };

/**
 * `/admin/taste-notes` action, keyed by `intent`: `create` (`name`, optional `parentId`) and
 * `delete` (`id`). Every success calls `invalidateStaticCache()` so taste-note lookups
 * re-fetch. Returns `{ ok: true, intent }` or `{ ok: false, intent, error }`.
 */
export const action = requireAdmin(
  async ({ request }: ActionFunctionArgs): Promise<AdminTasteNotesActionResult> => {
    const form = await request.formData();
    const intent = formString(form, 'intent');
    const opts = { signal: request.signal };
    try {
      if (intent === 'create') {
        const parentId = formString(form, 'parentId') || undefined;
        await withDataLog(log, 'AdminTasteNotesPage createTasteNote', { parentId }, () =>
          adminApi.createTasteNote({ name: formString(form, 'name').trim(), parentId }, opts),
        );
      } else if (intent === 'delete') {
        const id = formString(form, 'id');
        await withDataLog(log, 'AdminTasteNotesPage deleteTasteNote', { tasteNoteId: id }, () =>
          adminApi.deleteTasteNote(id, opts),
        );
      } else {
        return { ok: false, intent, error: 'Unknown intent' };
      }
      invalidateStaticCache();
      return { ok: true, intent };
    } catch (err) {
      return { ...toActionFailure(err, [401, 403]), intent };
    }
  },
);
