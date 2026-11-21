import type { CollectionDetailOutput, CollectionListItemOutput } from '@brewform/shared/schemas';
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
  collectionApi: { list: vi.fn(), addRecipe: vi.fn(), removeRecipe: vi.fn(), create: vi.fn() },
}));

import { ApiError } from '../../api/errors.ts';
import { collectionApi } from '../../api/index.ts';
import {
  MY_COLLECTIONS_PATH,
  myCollectionsAction,
  myCollectionsLoader,
  myCollectionsPath,
  shouldRevalidateMyCollections,
} from './collections.ts';

const mockApi = vi.mocked(collectionApi);

/** A collection name that must never reach a log line. */
const SECRET_NAME = 'Gifts for Ayse zq7private';

const COLLECTION: CollectionListItemOutput = {
  id: 'c1',
  userId: 'u1',
  name: 'Alpha',
  description: null,
  visibility: 'private',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  recipeCount: 2,
  containsRecipe: true,
};

const CREATED: CollectionDetailOutput = {
  id: 'c-new',
  userId: 'u1',
  name: SECRET_NAME,
  description: null,
  visibility: 'private',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  author: { username: 'tester', displayName: null, avatarUrl: null },
  recipeCount: 0,
  items: [],
};

/** Loader arguments for `url` (relative to the resource path). */
function loaderArgs(url: string) {
  const request = new Request(`http://localhost${url}`);
  return { request, params: {}, context: undefined } as never as Parameters<
    typeof myCollectionsLoader
  >[0] & { request: Request };
}

/** Action arguments posting the url-encoded `fields` (as `fetcher.submit` does). */
function actionArgs(fields: Record<string, string>) {
  const request = new Request(`http://localhost${MY_COLLECTIONS_PATH}`, {
    method: 'POST',
    body: new URLSearchParams(fields),
  });
  return { request, params: {}, context: undefined } as never as Parameters<
    typeof myCollectionsAction
  >[0] & { request: Request };
}

/** Every argument any logger method was called with, serialised (to scan for names). */
function loggedText(): string {
  return JSON.stringify(
    Object.values(mockLogger).flatMap((fn) => (fn as ReturnType<typeof vi.fn>).mock.calls),
    (_key, value) => (value instanceof Error ? value.message : value),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resources/collections/mine — paths and revalidation', () => {
  it('builds the resource path with an encoded recipe context', () => {
    expect(MY_COLLECTIONS_PATH).toBe('/resources/collections/mine');
    expect(myCollectionsPath('r1')).toBe('/resources/collections/mine?recipeId=r1');
    expect(myCollectionsPath('a b&c')).toBe('/resources/collections/mine?recipeId=a+b%26c');
  });

  it('never revalidates: the modal applies results and reloads explicitly', () => {
    expect(shouldRevalidateMyCollections()).toBe(false);
  });
});

describe('resources/collections/mine — loader', () => {
  it('lists my collections with the recipe context, forwarding request.signal', async () => {
    mockApi.list.mockResolvedValue({
      success: true,
      data: [COLLECTION],
      meta: { requestId: 'x', pagination: { page: 1, perPage: 20, total: 1, totalPages: 1 } },
    });
    const args = loaderArgs(myCollectionsPath('r1'));

    await expect(myCollectionsLoader(args)).resolves.toEqual({
      ok: true,
      collections: [COLLECTION],
    });
    expect(mockApi.list).toHaveBeenCalledWith({ recipeId: 'r1' }, { signal: args.request.signal });
    expect(mockLogger.debug).toHaveBeenCalledWith(
      { recipeId: 'r1' },
      'myCollectionsLoad completed',
    );
  });

  it('lists without a recipe context when none is given', async () => {
    mockApi.list.mockResolvedValue({
      success: true,
      data: [],
      meta: { requestId: 'x', pagination: { page: 1, perPage: 20, total: 0, totalPages: 0 } },
    });
    const args = loaderArgs(MY_COLLECTIONS_PATH);

    await expect(myCollectionsLoader(args)).resolves.toEqual({ ok: true, collections: [] });
    expect(mockApi.list).toHaveBeenCalledWith(undefined, { signal: args.request.signal });
  });

  it('a failure (even a 401) returns { ok: false } and is logged, never thrown', async () => {
    const err = new ApiError('UNAUTHORIZED', 'expired', undefined, 401);
    mockApi.list.mockRejectedValue(err);

    await expect(myCollectionsLoader(loaderArgs(myCollectionsPath('r1')))).resolves.toEqual({
      ok: false,
      error: 'expired',
      code: 'UNAUTHORIZED',
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err, recipeId: 'r1' },
      'myCollectionsLoad failed',
    );
  });

  it('an abort is rethrown for the router', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    mockApi.list.mockRejectedValue(abort);
    await expect(myCollectionsLoader(loaderArgs(myCollectionsPath('r1')))).rejects.toBe(abort);
  });
});

describe('resources/collections/mine — action', () => {
  it('add: adds the recipe with request.signal and reports the membership', async () => {
    mockApi.addRecipe.mockResolvedValue({ message: 'Recipe added' });
    const args = actionArgs({ intent: 'add', collectionId: 'c2', recipeId: 'r1' });

    await expect(myCollectionsAction(args)).resolves.toEqual({
      ok: true,
      intent: 'add',
      collectionId: 'c2',
      containsRecipe: true,
    });
    expect(mockApi.addRecipe).toHaveBeenCalledWith('c2', 'r1', { signal: args.request.signal });
    expect(mockApi.removeRecipe).not.toHaveBeenCalled();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      { intent: 'add', collectionId: 'c2', recipeId: 'r1' },
      'myCollectionsAdd completed',
    );
  });

  it('remove: removes the recipe with request.signal and reports the membership', async () => {
    mockApi.removeRecipe.mockResolvedValue({ message: 'Recipe removed' });
    const args = actionArgs({ intent: 'remove', collectionId: 'c1', recipeId: 'r1' });

    await expect(myCollectionsAction(args)).resolves.toEqual({
      ok: true,
      intent: 'remove',
      collectionId: 'c1',
      containsRecipe: false,
    });
    expect(mockApi.removeRecipe).toHaveBeenCalledWith('c1', 'r1', { signal: args.request.signal });
    expect(mockApi.addRecipe).not.toHaveBeenCalled();
  });

  it('add: a 409 conflict comes back as { ok: false, code: CONFLICT } with the intent', async () => {
    mockApi.addRecipe.mockRejectedValue(
      new ApiError('CONFLICT', 'Recipe already in this collection', undefined, 409),
    );

    await expect(
      myCollectionsAction(actionArgs({ intent: 'add', collectionId: 'c2', recipeId: 'r1' })),
    ).resolves.toEqual({
      ok: false,
      intent: 'add',
      collectionId: 'c2',
      error: 'Recipe already in this collection',
      code: 'CONFLICT',
    });
  });

  it('remove: an API failure (a 401 included) returns { ok: false } instead of throwing', async () => {
    mockApi.removeRecipe.mockRejectedValue(new ApiError('UNAUTHORIZED', 'expired', undefined, 401));

    await expect(
      myCollectionsAction(actionArgs({ intent: 'remove', collectionId: 'c1', recipeId: 'r1' })),
    ).resolves.toEqual({
      ok: false,
      intent: 'remove',
      collectionId: 'c1',
      error: 'expired',
      code: 'UNAUTHORIZED',
    });
  });

  it('create: creates the collection, then adds the recipe to it', async () => {
    mockApi.create.mockResolvedValue(CREATED);
    mockApi.addRecipe.mockResolvedValue({ message: 'Recipe added' });
    const args = actionArgs({
      intent: 'create',
      recipeId: 'r1',
      name: `  ${SECRET_NAME}  `,
      visibility: 'unlisted',
    });

    await expect(myCollectionsAction(args)).resolves.toEqual({
      ok: true,
      intent: 'create',
      collectionId: 'c-new',
    });
    expect(mockApi.create).toHaveBeenCalledWith(
      { name: SECRET_NAME, visibility: 'unlisted' },
      { signal: args.request.signal },
    );
    expect(mockApi.addRecipe).toHaveBeenCalledWith('c-new', 'r1', {
      signal: args.request.signal,
    });
  });

  it('create: a failed create returns { ok: false } without a collection id or an add', async () => {
    mockApi.create.mockRejectedValue(new ApiError('INTERNAL_ERROR', 'Boom', undefined, 500));

    await expect(
      myCollectionsAction(
        actionArgs({ intent: 'create', recipeId: 'r1', name: 'Mine', visibility: 'private' }),
      ),
    ).resolves.toEqual({ ok: false, intent: 'create', error: 'Boom', code: 'INTERNAL_ERROR' });
    expect(mockApi.addRecipe).not.toHaveBeenCalled();
  });

  it('create: a failed add after the create returns { ok: false } with the new collection id', async () => {
    mockApi.create.mockResolvedValue(CREATED);
    const err = new ApiError('FORBIDDEN', 'Not your recipe', undefined, 403);
    mockApi.addRecipe.mockRejectedValue(err);

    await expect(
      myCollectionsAction(
        actionArgs({ intent: 'create', recipeId: 'r1', name: 'Mine', visibility: 'private' }),
      ),
    ).resolves.toEqual({
      ok: false,
      intent: 'create',
      collectionId: 'c-new',
      error: 'Not your recipe',
      code: 'FORBIDDEN',
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err, intent: 'create', collectionId: 'c-new', recipeId: 'r1' },
      'myCollectionsCreateAdd failed',
    );
  });

  it('create: an empty name or an unknown visibility fails validation without an API call', async () => {
    await expect(
      myCollectionsAction(
        actionArgs({ intent: 'create', recipeId: 'r1', name: '   ', visibility: 'private' }),
      ),
    ).resolves.toMatchObject({ ok: false, intent: 'create', code: 'VALIDATION_ERROR' });
    await expect(
      myCollectionsAction(
        actionArgs({ intent: 'create', recipeId: 'r1', name: 'Mine', visibility: 'secret' }),
      ),
    ).resolves.toMatchObject({ ok: false, intent: 'create', code: 'VALIDATION_ERROR' });
    expect(mockApi.create).not.toHaveBeenCalled();
  });

  it('add/remove: a missing collection or recipe id fails validation without an API call', async () => {
    await expect(
      myCollectionsAction(actionArgs({ intent: 'add', collectionId: '', recipeId: 'r1' })),
    ).resolves.toMatchObject({ ok: false, intent: 'add', code: 'VALIDATION_ERROR' });
    await expect(
      myCollectionsAction(actionArgs({ intent: 'remove', collectionId: 'c1' })),
    ).resolves.toMatchObject({ ok: false, intent: 'remove', code: 'VALIDATION_ERROR' });
    expect(mockApi.addRecipe).not.toHaveBeenCalled();
    expect(mockApi.removeRecipe).not.toHaveBeenCalled();
  });

  it('an unknown or missing intent fails without calling the API', async () => {
    await expect(myCollectionsAction(actionArgs({ intent: 'rename' }))).resolves.toMatchObject({
      ok: false,
      intent: '',
    });
    await expect(myCollectionsAction(actionArgs({}))).resolves.toMatchObject({ ok: false });
    expect(mockApi.addRecipe).not.toHaveBeenCalled();
    expect(mockApi.removeRecipe).not.toHaveBeenCalled();
    expect(mockApi.create).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      { intent: 'rename' },
      'myCollectionsAction unknown intent',
    );
  });

  it('an abort is rethrown for the router', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    mockApi.addRecipe.mockRejectedValue(abort);
    await expect(
      myCollectionsAction(actionArgs({ intent: 'add', collectionId: 'c2', recipeId: 'r1' })),
    ).rejects.toBe(abort);
  });

  it('never logs the collection name, on success or failure', async () => {
    mockApi.create.mockResolvedValueOnce(CREATED);
    mockApi.addRecipe.mockResolvedValueOnce({ message: 'ok' });
    await myCollectionsAction(
      actionArgs({ intent: 'create', recipeId: 'r1', name: SECRET_NAME, visibility: 'private' }),
    );
    mockApi.create.mockRejectedValueOnce(new Error('down'));
    await myCollectionsAction(
      actionArgs({ intent: 'create', recipeId: 'r1', name: SECRET_NAME, visibility: 'private' }),
    );

    expect(mockLogger.debug).toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalled();
    expect(loggedText()).not.toContain('zq7private');
  });
});
