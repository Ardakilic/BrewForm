import type { RecipeUserNoteOutput } from '@brewform/shared/schemas';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
}));
vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }));

vi.mock('../../api/index.ts', () => ({
  recipeApi: { getMyNote: vi.fn(), saveMyNote: vi.fn(), deleteMyNote: vi.fn() },
}));

import { ApiError } from '../../api/errors.ts';
import { recipeApi } from '../../api/index.ts';
import {
  recipeNoteAction,
  recipeNoteLoader,
  recipeNotePath,
  shouldRevalidateRecipeNote,
} from './recipe-notes.ts';

const mockApi = vi.mocked(recipeApi);

const SECRET = 'Grind one step finer — zq7private';

const NOTE: RecipeUserNoteOutput = {
  recipeId: 'r1',
  notes: SECRET,
  updatedAt: '2026-11-20T10:00:00.000Z',
};
const ABSENT: RecipeUserNoteOutput = { recipeId: 'r1', notes: null, updatedAt: null };

/** Loader arguments for recipe `id`. */
function loaderArgs(id: string) {
  const request = new Request(`http://localhost${recipeNotePath(id)}`);
  return { request, params: { id }, context: undefined } as never as Parameters<
    typeof recipeNoteLoader
  >[0] & { request: Request };
}

/** Action arguments for recipe `id` posting the url-encoded `fields` (as `fetcher.submit` does). */
function actionArgs(id: string, fields: Record<string, string>) {
  const request = new Request(`http://localhost${recipeNotePath(id)}`, {
    method: 'POST',
    body: new URLSearchParams(fields),
  });
  return { request, params: { id }, context: undefined } as never as Parameters<
    typeof recipeNoteAction
  >[0] & { request: Request };
}

/** Every argument any logger method was called with, serialised (to scan for note text). */
function loggedText(): string {
  return JSON.stringify(
    Object.values(mockLogger).flatMap((fn) => (fn as ReturnType<typeof vi.fn>).mock.calls),
    (_key, value) => (value instanceof Error ? value.message : value),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resources/recipes/:id/notes', () => {
  it('builds the resource path (encoding the id)', () => {
    expect(recipeNotePath('r1')).toBe('/resources/recipes/r1/notes');
    expect(recipeNotePath('a/b')).toBe('/resources/recipes/a%2Fb/notes');
  });

  it('loader: returns the caller note, forwarding request.signal', async () => {
    mockApi.getMyNote.mockResolvedValue(NOTE);
    const args = loaderArgs('r1');

    await expect(recipeNoteLoader(args)).resolves.toEqual({ ok: true, note: NOTE });
    expect(mockApi.getMyNote).toHaveBeenCalledWith('r1', { signal: args.request.signal });
    expect(mockLogger.debug).toHaveBeenCalledWith({ recipeId: 'r1' }, 'recipeNoteLoad started');
    expect(mockLogger.debug).toHaveBeenCalledWith({ recipeId: 'r1' }, 'recipeNoteLoad completed');
  });

  it('loader: a failure (even a 401) returns { ok: false } and is logged', async () => {
    const err = new ApiError('UNAUTHORIZED', 'no', undefined, 401);
    mockApi.getMyNote.mockRejectedValue(err);

    await expect(recipeNoteLoader(loaderArgs('r1'))).resolves.toEqual({
      ok: false,
      error: 'no',
      code: 'UNAUTHORIZED',
    });
    expect(mockLogger.error).toHaveBeenCalledWith({ err, recipeId: 'r1' }, 'recipeNoteLoad failed');
  });

  it('loader: an abort is rethrown for the router', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    mockApi.getMyNote.mockRejectedValue(abort);
    await expect(recipeNoteLoader(loaderArgs('r1'))).rejects.toBe(abort);
  });

  it('action save: PUTs { notes } with request.signal and returns the stored note', async () => {
    mockApi.saveMyNote.mockResolvedValue(NOTE);
    const args = actionArgs('r1', { intent: 'save', notes: SECRET });

    await expect(recipeNoteAction(args)).resolves.toEqual({ ok: true, note: NOTE });
    expect(mockApi.saveMyNote).toHaveBeenCalledWith(
      'r1',
      { notes: SECRET },
      { signal: args.request.signal },
    );
    expect(mockApi.deleteMyNote).not.toHaveBeenCalled();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      { recipeId: 'r1', intent: 'save', noteLength: SECRET.length },
      'recipeNoteSave completed',
    );
  });

  it('action delete: DELETEs with request.signal and returns the absent note', async () => {
    mockApi.deleteMyNote.mockResolvedValue(ABSENT);
    const args = actionArgs('r1', { intent: 'delete' });

    await expect(recipeNoteAction(args)).resolves.toEqual({ ok: true, note: ABSENT });
    expect(mockApi.deleteMyNote).toHaveBeenCalledWith('r1', { signal: args.request.signal });
    expect(mockApi.saveMyNote).not.toHaveBeenCalled();
  });

  it('action: an API failure (a 401 included) returns { ok: false } instead of throwing', async () => {
    mockApi.saveMyNote.mockRejectedValue(
      new ApiError('VALIDATION_ERROR', 'Notes are empty', undefined, 400),
    );
    await expect(
      recipeNoteAction(actionArgs('r1', { intent: 'save', notes: '<b></b>' })),
    ).resolves.toEqual({ ok: false, error: 'Notes are empty', code: 'VALIDATION_ERROR' });

    mockApi.deleteMyNote.mockRejectedValue(new ApiError('UNAUTHORIZED', 'expired', undefined, 401));
    await expect(recipeNoteAction(actionArgs('r1', { intent: 'delete' }))).resolves.toEqual({
      ok: false,
      error: 'expired',
      code: 'UNAUTHORIZED',
    });
  });

  it('action: an unknown or missing intent fails without calling the API', async () => {
    await expect(recipeNoteAction(actionArgs('r1', { intent: 'publish' }))).resolves.toMatchObject({
      ok: false,
    });
    await expect(recipeNoteAction(actionArgs('r1', {}))).resolves.toMatchObject({ ok: false });
    expect(mockApi.saveMyNote).not.toHaveBeenCalled();
    expect(mockApi.deleteMyNote).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      { recipeId: 'r1', intent: 'publish' },
      'recipeNoteAction unknown intent',
    );
  });

  it('action: an abort is rethrown for the router', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    mockApi.saveMyNote.mockRejectedValue(abort);
    await expect(recipeNoteAction(actionArgs('r1', { intent: 'save', notes: 'x' }))).rejects.toBe(
      abort,
    );
  });

  it('never logs the note text, on success or failure', async () => {
    mockApi.getMyNote.mockResolvedValue(NOTE);
    mockApi.saveMyNote.mockResolvedValueOnce(NOTE);
    await recipeNoteLoader(loaderArgs('r1'));
    await recipeNoteAction(actionArgs('r1', { intent: 'save', notes: SECRET }));
    mockApi.saveMyNote.mockRejectedValueOnce(new Error('down'));
    await recipeNoteAction(actionArgs('r1', { intent: 'save', notes: SECRET }));

    expect(mockLogger.debug).toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalled();
    expect(loggedText()).not.toContain('zq7private');
  });

  it('never revalidates: the editor applies the action result itself', () => {
    expect(shouldRevalidateRecipeNote()).toBe(false);
  });
});
