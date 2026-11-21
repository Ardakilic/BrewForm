/**
 * Revalidation scope on `/recipes/:slug` (`web-data-loading` requirement "Revalidation after
 * actions is scoped to affected data"): the page runs its real loader, `shouldRevalidate`,
 * social/comment/rate actions and the real API client over a stubbed `fetch`, and the test
 * counts the HTTP requests each interaction sends.
 */
import { t } from '@brewform/shared/i18n';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RouteObject } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

// Presentational and self-loading side cards are irrelevant to the request count.
vi.mock('../../components/brew-log/RecipeBrewStats.tsx', () => ({ RecipeBrewStats: () => null }));
vi.mock('../../components/brew-log/BrewHistorySection.tsx', () => ({
  BrewHistorySection: () => null,
}));
vi.mock('../../components/collections/AddToCollectionButton.tsx', () => ({
  AddToCollectionButton: () => null,
}));
vi.mock('../../components/recipe/ShareSection.tsx', () => ({ ShareSection: () => null }));
vi.mock('../../components/recipe/RecipeNotesSection.tsx', () => ({
  RecipeNotesSection: () => null,
}));
vi.mock('../../components/recipe/ForkCard.tsx', () => ({ ForkCard: () => null }));
vi.mock('../../components/recipe/BrewTimeline.tsx', () => ({ BrewTimeline: () => null }));
vi.mock('../../components/recipe/StatCards.tsx', () => ({ StatCards: () => null }));
vi.mock('../../components/recipe/BeanSection.tsx', () => ({ BeanSection: () => null }));
vi.mock('../../components/recipe/EquipmentSection.tsx', () => ({ EquipmentSection: () => null }));
vi.mock('../../components/recipe/TastingNotesSection.tsx', () => ({
  TastingNotesSection: () => null,
}));

import { clearStaticCache } from '../../api/static-cache.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import {
  createCommentAction,
  deleteCommentAction,
  listCommentsLoader,
} from '../../routes/comments.ts';
import { favouriteAction } from '../../routes/favourite.ts';
import { likeAction } from '../../routes/like.ts';
import { rateAction } from '../../routes/rate.ts';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { loader, shouldRevalidate } from './RecipeDetailPage.data.ts';
import { RecipeDetailPage } from './RecipeDetailPage.tsx';

const RECIPE_ID = 'recipe-1';
const SLUG = 'my-espresso';

const RECIPE = {
  id: RECIPE_ID,
  slug: SLUG,
  title: 'My Espresso',
  visibility: 'public',
  authorId: 'author-1',
  author: { id: 'author-1', username: 'alice', displayName: 'Alice', avatarUrl: null },
  likeCount: 5,
  commentCount: 15,
  forkCount: 0,
  userLiked: false,
  userFavourited: false,
  favouriteCount: 2,
  avgRating: null,
  ratingCount: 0,
  userRating: null,
  tasteNotes: [],
  equipment: [],
  photos: [],
  createdAt: '2026-05-01T00:00:00Z',
  currentVersion: { brewMethod: 'ESPRESSO', drinkType: 'ESPRESSO', rating: null },
};

/** A comment fixture with the given id and content. */
function comment(id: string, content: string) {
  return {
    id,
    recipeId: RECIPE_ID,
    content,
    authorId: 'author-1',
    parentCommentId: null,
    createdAt: '2026-05-02T00:00:00Z',
    updatedAt: '2026-05-02T00:00:00Z',
    deletedAt: null,
    author: { id: 'author-1', username: 'alice', displayName: 'Alice', avatarUrl: null },
    replies: [],
  };
}

const PAGE_1 = Array.from({ length: 10 }, (_, i) => comment(`p1-${i}`, `First page ${i}`));
const PAGE_2 = Array.from({ length: 5 }, (_, i) => comment(`p2-${i}`, `Second page ${i}`));

/** Every request the page sent, as `METHOD /path?search`. */
let requests: string[] = [];

/** A JSON success envelope. */
function ok(data: unknown, meta?: unknown): Response {
  return new Response(JSON.stringify({ success: true, data, ...(meta ? { meta } : {}) }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Stubs `fetch` with the recipe, comment pages, collections and the three actions. */
function stubApi(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(respond(input, init))),
  );
}

/** Answers one stubbed API request synchronously and records it. */
function respond(input: RequestInfo | URL, init?: RequestInit): Response {
  const url = new URL(String(input), 'http://localhost');
  const path = url.pathname.replace(/^\/api\/v1/, '');
  const method = init?.method ?? 'GET';
  requests.push(`${method} ${path}${url.search}`);
  if (method === 'GET' && path === `/recipes/${SLUG}`) return ok(RECIPE);
  if (method === 'GET' && path === '/taste-notes/flat') return ok([]);
  if (method === 'GET' && path === `/recipes/${RECIPE_ID}/collections`) return ok([]);
  if (method === 'GET' && path === `/comments/recipe/${RECIPE_ID}`) {
    const page = url.searchParams.get('page') === '2' ? 2 : 1;
    return ok(page === 1 ? PAGE_1 : PAGE_2, {
      pagination: { page, perPage: 10, total: 15, totalPages: 2 },
    });
  }
  if (method === 'POST' && path === `/recipes/${RECIPE_ID}/like`) return ok({ liked: true });
  if (method === 'POST' && path === `/recipes/${RECIPE_ID}/favourite`) {
    return ok({ favourited: true });
  }
  if (method === 'POST' && path === `/recipes/${RECIPE_ID}/rate`) {
    return ok({ rating: 8, avgRating: 8, ratingCount: 1 });
  }
  return new Response(JSON.stringify({ success: false, error: { code: 'NOT_FOUND' } }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** The detail route with its real loader and `shouldRevalidate`, plus the action routes it posts to. */
const routes: RouteObject[] = [
  {
    path: '/recipes/:slug',
    loader,
    shouldRevalidate,
    Component: RecipeDetailPage,
    errorElement: <RouteErrorState />,
  },
  { path: '/recipes/:id/like', action: likeAction },
  { path: '/recipes/:id/favourite', action: favouriteAction },
  { path: '/recipes/:id/rate', action: rateAction },
  {
    path: '/comments/recipe/:recipeId',
    loader: listCommentsLoader,
    action: createCommentAction,
  },
  { path: '/comments/:id', action: deleteCommentAction },
];

/** Renders `/recipes/my-espresso` signed in and waits for the first comments page. */
async function renderDetail() {
  const result = renderWithAppProviders(routes, {
    initialEntries: [`/recipes/${SLUG}`],
    auth: 'user',
  });
  await screen.findByText('First page 0');
  return result;
}

/** Waits until every fetcher and navigation is idle. */
async function waitForIdle(router: ReturnType<typeof renderWithAppProviders>['router']) {
  await waitFor(() => {
    expect(router.state.navigation.state).toBe('idle');
    expect(router.state.revalidation).toBe('idle');
    expect([...router.state.fetchers.values()].every((f) => f.state === 'idle')).toBe(true);
  });
}

beforeEach(() => {
  requests = [];
  localStorage.clear();
  clearStaticCache();
  stubApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RecipeDetailPage revalidation scope', () => {
  it('a like sends exactly one request and keeps the liked state', async () => {
    const { router } = await renderDetail();
    requests = [];

    await userEvent.click(screen.getByRole('button', { name: /❤️/ }));
    await waitForIdle(router);

    expect(requests).toEqual([`POST /recipes/${RECIPE_ID}/like`]);
    expect(screen.getByRole('button', { name: /❤️/ })).toHaveTextContent('6');
  });

  it('a favourite sends exactly one request', async () => {
    const { router } = await renderDetail();
    requests = [];

    await userEvent.click(screen.getByRole('button', { name: /☆/ }));
    await waitForIdle(router);

    expect(requests).toEqual([`POST /recipes/${RECIPE_ID}/favourite`]);
    expect(screen.getByRole('button', { name: /⭐/ })).toHaveTextContent('3');
  });

  it('loaded comment pages survive a favourite and a rating revalidation', async () => {
    const { router } = await renderDetail();

    await userEvent.click(screen.getByRole('button', { name: t('comment.loadMore') }));
    expect(await screen.findByText('Second page 4')).toBeInTheDocument();

    requests = [];
    await userEvent.click(screen.getByRole('button', { name: /☆/ }));
    await waitForIdle(router);
    expect(requests).toEqual([`POST /recipes/${RECIPE_ID}/favourite`]);
    expect(screen.getByText('Second page 4')).toBeInTheDocument();

    // Rating still revalidates the loader (the community average comes from it) …
    requests = [];
    const slider = screen.getByRole('slider', { name: t('recipe.rateThis') });
    fireEvent.keyDown(slider, { key: '4' });
    fireEvent.keyDown(slider, { key: 'Enter' });
    await waitFor(() => expect(requests).toContain(`GET /recipes/${SLUG}`));
    await waitForIdle(router);
    expect(requests[0]).toBe(`POST /recipes/${RECIPE_ID}/rate`);
    expect(requests).toContain(`GET /comments/recipe/${RECIPE_ID}?page=1`);

    // … and the revalidated first page is merged into the loaded pages, not reset to page 1.
    expect(screen.getByText('First page 0')).toBeInTheDocument();
    expect(screen.getByText('Second page 4')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('comment.loadMore') })).toBeNull();
  });
});
