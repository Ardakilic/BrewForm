// deno-lint-ignore-file no-explicit-any
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockList } = vi.hoisted(() => ({ mockList: vi.fn() }));

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

vi.mock('../api/index.ts', () => ({
  commentApi: {
    list: mockList,
  },
}));

import { listCommentsLoader } from './comments.ts';

function makeRequest(url: string): Request {
  return new Request(url, { method: 'GET' });
}

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
    expect(mockList).toHaveBeenCalledWith('recipe-1', 1);
  });

  it('defaults page to 1 when the query param is absent', async () => {
    mockList.mockResolvedValue({
      data: [],
      meta: { pagination: { total: 0, page: 1, perPage: 10, totalPages: 0 } },
    });

    await listCommentsLoader(
      makeArgs('recipe-1', makeRequest('https://example.test/comments/recipe/recipe-1')),
    );

    expect(mockList).toHaveBeenCalledWith('recipe-1', 1);
  });

  it('parses the page query param when present and numeric', async () => {
    mockList.mockResolvedValue({
      data: [],
      meta: { pagination: { total: 0, page: 3, perPage: 10, totalPages: 0 } },
    });

    await listCommentsLoader(
      makeArgs('recipe-1', makeRequest('https://example.test/comments/recipe/recipe-1?page=3')),
    );

    expect(mockList).toHaveBeenCalledWith('recipe-1', 3);
  });

  it('defaults page to 1 when the query param is non-numeric', async () => {
    mockList.mockResolvedValue({
      data: [],
      meta: { pagination: { total: 0, page: 1, perPage: 10, totalPages: 0 } },
    });

    await listCommentsLoader(
      makeArgs('recipe-1', makeRequest('https://example.test/comments/recipe/recipe-1?page=foo')),
    );

    expect(mockList).toHaveBeenCalledWith('recipe-1', 1);
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
      listCommentsLoader(
        makeArgs('', makeRequest('https://example.test/comments/recipe/?page=1')),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(mockList).not.toHaveBeenCalled();
  });
});
