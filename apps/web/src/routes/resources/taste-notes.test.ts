import type { TasteNoteOutput } from '@brewform/shared/schemas';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/logger.ts', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  }),
}));

vi.mock('../../api/static-cache.ts', () => ({
  getTasteNotesCached: vi.fn(),
}));

import { getTasteNotesCached } from '../../api/static-cache.ts';
import { shouldRevalidateTasteNotes, TASTE_NOTES_PATH, tasteNotesLoader } from './taste-notes.ts';

const mockGetTasteNotesCached = vi.mocked(getTasteNotesCached);

/** Builds loader arguments. */
function args() {
  const request = new Request(`http://localhost${TASTE_NOTES_PATH}`);
  return { request, params: {}, context: undefined };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resources/taste-notes', () => {
  it('serves the flat list from the static cache, forwarding request.signal', async () => {
    const notes = [{ id: 'n1', name: 'Berry' }] as TasteNoteOutput[];
    mockGetTasteNotesCached.mockResolvedValue(notes);
    const a = args();

    await expect(tasteNotesLoader(a as never)).resolves.toEqual({ ok: true, notes });
    expect(mockGetTasteNotesCached).toHaveBeenCalledWith({ signal: a.request.signal });
  });

  it('returns { ok: false } when the lookup fails', async () => {
    mockGetTasteNotesCached.mockRejectedValue(new Error('down'));
    await expect(tasteNotesLoader(args() as never)).resolves.toEqual({
      ok: false,
      error: 'down',
    });
  });

  it('never revalidates after an action', () => {
    expect(shouldRevalidateTasteNotes()).toBe(false);
  });
});
