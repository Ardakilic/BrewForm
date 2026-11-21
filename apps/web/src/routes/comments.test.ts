import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockList, mockCreate, mockDelete, mockLogger } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockCreate: vi.fn(),
  mockDelete: vi.fn(),
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

vi.mock('../api/index.ts', () => ({
  commentApi: {
    list: mockList,
    create: mockCreate,
    delete: mockDelete,
  },
}));

import { ApiError } from '../api/errors.ts';
import { createCommentAction, deleteCommentAction, listCommentsLoader } from './comments.ts';

/** Build a minimal GET `Request` matching the shape `LoaderFunctionArgs.request` expects. */
function makeRequest(url: string): Request {
  return new Request(url, { method: 'GET' });
}

/** Cast a `(recipeId, request)` pair into the `LoaderFunctionArgs` shape the loader destructures. */
function makeArgs(recipeId: string | undefined, request: Request) {
  return { params: { recipeId }, request } as unknown as Parameters<typeof listCommentsLoader>[0];
}

describe('listCommentsLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the full PaginatedResponse wrapper from commentApi.list', async () => {
    const paginated = {
      data: [
        { id: 'c1', content: 'hi', authorId: 'u1', createdAt: '2024-01-01T00:00:00Z', replies: [] },
      ],
      meta: { pagination: { total: 1, page: 1, perPage: 10, totalPages: 1 } },
    };
    mockList.mockResolvedValue(paginated);

    const result = await listCommentsLoader(
      makeArgs('recipe-1', makeRequest('https://example.test/comments/recipe/recipe-1?page=1')),
    );

    expect(result).toBe(paginated);
    expect(mockList).toHaveBeenCalledWith('recipe-1', 1, { signal: expect.any(AbortSignal) });
  });

  it('defaults page to 1 when the query param is absent', async () => {
    mockList.mockResolvedValue({
      data: [],
      meta: { pagination: { total: 0, page: 1, perPage: 10, totalPages: 0 } },
    });

    await listCommentsLoader(
      makeArgs('recipe-1', makeRequest('https://example.test/comments/recipe/recipe-1')),
    );

    expect(mockList).toHaveBeenCalledWith('recipe-1', 1, { signal: expect.any(AbortSignal) });
  });

  it('parses the page query param when present and numeric', async () => {
    mockList.mockResolvedValue({
      data: [],
      meta: { pagination: { total: 0, page: 3, perPage: 10, totalPages: 0 } },
    });

    await listCommentsLoader(
      makeArgs('recipe-1', makeRequest('https://example.test/comments/recipe/recipe-1?page=3')),
    );

    expect(mockList).toHaveBeenCalledWith('recipe-1', 3, { signal: expect.any(AbortSignal) });
  });

  it('defaults page to 1 when the query param is non-numeric', async () => {
    mockList.mockResolvedValue({
      data: [],
      meta: { pagination: { total: 0, page: 1, perPage: 10, totalPages: 0 } },
    });

    await listCommentsLoader(
      makeArgs('recipe-1', makeRequest('https://example.test/comments/recipe/recipe-1?page=foo')),
    );

    expect(mockList).toHaveBeenCalledWith('recipe-1', 1, { signal: expect.any(AbortSignal) });
  });

  it('throws 400 when recipeId path param is missing', async () => {
    await expect(
      listCommentsLoader(
        makeArgs(undefined, makeRequest('https://example.test/comments/recipe/?page=1')),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(mockList).not.toHaveBeenCalled();
  });

  it('throws 400 when recipeId path param is an empty string', async () => {
    await expect(
      listCommentsLoader(makeArgs('', makeRequest('https://example.test/comments/recipe/?page=1'))),
    ).rejects.toMatchObject({ status: 400 });
    expect(mockList).not.toHaveBeenCalled();
  });
});

/** Runs `createCommentAction` for recipe `recipe-1` with the given form fields. */
function runCreate(fields: Record<string, string>, recipeId: string | undefined = 'recipe-1') {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return createCommentAction({
    params: { recipeId },
    request: new Request('https://example.test/comments/recipe/recipe-1', {
      method: 'POST',
      body: form,
    }),
    context: undefined,
  } as never);
}

/** Runs `deleteCommentAction` for comment `id`. */
function runDelete(id: string | undefined = 'c1') {
  return deleteCommentAction({
    params: { id },
    request: new Request(`https://example.test/comments/${id}`, { method: 'DELETE' }),
    context: undefined,
  } as never);
}

const CREATED = {
  id: 'c9',
  recipeId: 'recipe-1',
  content: 'Lovely',
  authorId: 'u1',
  parentCommentId: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  deletedAt: null,
};

describe('createCommentAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns { ok: true, comment } and forwards the signal', async () => {
    mockCreate.mockResolvedValue(CREATED);

    await expect(runCreate({ content: '  Lovely  ' })).resolves.toEqual({
      ok: true,
      comment: CREATED,
    });
    expect(mockCreate).toHaveBeenCalledWith(
      'recipe-1',
      { content: 'Lovely' },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('sends parentCommentId for a reply', async () => {
    mockCreate.mockResolvedValue({ ...CREATED, parentCommentId: 'c1' });

    await runCreate({ content: 'Thanks', parentCommentId: 'c1' });

    expect(mockCreate).toHaveBeenCalledWith(
      'recipe-1',
      { content: 'Thanks', parentCommentId: 'c1' },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('returns { ok: false, error, code } when the API fails, without throwing', async () => {
    const err = new ApiError('INTERNAL_ERROR', 'Something broke', undefined, 500);
    mockCreate.mockRejectedValue(err);

    await expect(runCreate({ content: 'Lovely' })).resolves.toEqual({
      ok: false,
      error: 'Something broke',
      code: 'INTERNAL_ERROR',
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err, recipeId: 'recipe-1' },
      'createCommentAction failed',
    );
  });

  it('returns { ok: false } for a 401 instead of throwing into the error boundary', async () => {
    mockCreate.mockRejectedValue(new ApiError('UNAUTHORIZED', 'Sign in', undefined, 401));

    await expect(runCreate({ content: 'Lovely' })).resolves.toMatchObject({
      ok: false,
      code: 'UNAUTHORIZED',
    });
  });

  it('returns { ok: false } for empty content without calling the API', async () => {
    await expect(runCreate({ content: '   ' })).resolves.toMatchObject({ ok: false });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('throws 400 when the route is mis-wired without a recipe id', async () => {
    await expect(runCreate({ content: 'Lovely' }, '')).rejects.toMatchObject({ status: 400 });
  });
});

describe('deleteCommentAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns { ok: true } and forwards the signal', async () => {
    mockDelete.mockResolvedValue({ message: 'deleted' });

    await expect(runDelete('c1')).resolves.toEqual({ ok: true });
    expect(mockDelete).toHaveBeenCalledWith('c1', { signal: expect.any(AbortSignal) });
  });

  it('returns { ok: false, error } when the API fails, without throwing', async () => {
    const err = new ApiError('FORBIDDEN', 'Not yours', undefined, 403);
    mockDelete.mockRejectedValue(err);

    await expect(runDelete('c1')).resolves.toEqual({
      ok: false,
      error: 'Not yours',
      code: 'FORBIDDEN',
    });
    expect(mockLogger.error).toHaveBeenCalledWith({ err, id: 'c1' }, 'deleteCommentAction failed');
  });

  it('returns { ok: false } for a network error', async () => {
    mockDelete.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(runDelete('c1')).resolves.toEqual({ ok: false, error: 'Failed to fetch' });
  });

  it('throws 400 when the route is mis-wired without an id', async () => {
    await expect(runDelete('')).rejects.toMatchObject({ status: 400 });
  });
});
