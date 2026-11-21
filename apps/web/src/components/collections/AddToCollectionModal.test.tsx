/**
 * `AddToCollectionModal` (`recipe-collections` requirement "Frontend components — CollectionCard,
 * AddToCollectionModal, CollectionRecipeList"). The modal runs inside a page route (with the real
 * recipe-detail `shouldRevalidate`) next to the real `resources/collections/mine` resource route
 * and the real API client over a stubbed `fetch`, so the tests see the exact HTTP requests that
 * opening the modal, toggling membership and creating a collection send.
 */

import { t } from '@brewform/shared/i18n';
import type { CollectionListItemOutput } from '@brewform/shared/schemas';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
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

import { shouldRevalidate as shouldRevalidateDetail } from '../../pages/recipes/RecipeDetailPage.data.ts';
import {
  myCollectionsAction,
  myCollectionsLoader,
  shouldRevalidateMyCollections,
} from '../../routes/resources/collections.ts';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { AddToCollectionButton } from './AddToCollectionButton.tsx';
import { AddToCollectionModal } from './AddToCollectionModal.tsx';

const RECIPE_ID = 'recipe-1';

/** One recorded HTTP request: `METHOD /path?query` plus its raw body. */
interface RecordedRequest {
  line: string;
  body: string | null;
}

/** A stored collection of the stubbed API: its list row minus the computed fields. */
type StoredCollection = Omit<CollectionListItemOutput, 'recipeCount' | 'containsRecipe'> & {
  recipeIds: string[];
};

/** Every request the modal sent. */
let requests: RecordedRequest[] = [];
/** The signed-in user's collections the stubbed API serves. */
let stored: StoredCollection[] = [];
/** Status the stubbed API answers the list `GET` with (200 = success). */
let listStatus = 200;
/** Status the stubbed API answers an add `POST` with (201 = success). */
let addStatus = 201;
/** Status the stubbed API answers a remove `DELETE` with (200 = success). */
let removeStatus = 200;
/** Status the stubbed API answers a create `POST /collections` with (201 = success). */
let createStatus = 201;
/** How many times the page route's loader ran. */
let pageLoaderRuns = 0;

/** A stored collection with defaults. */
function makeStored(overrides: Partial<StoredCollection> = {}): StoredCollection {
  return {
    id: 'c1',
    userId: 'u1',
    name: 'Alpha',
    description: null,
    visibility: 'private',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    recipeIds: [],
    ...overrides,
  };
}

/** A JSON response with the given status and body. */
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** The error envelope for `status` (409 answers like the API's ALREADY_IN_COLLECTION). */
function apiError(status: number): Response {
  const code = status === 409 ? 'CONFLICT' : 'INTERNAL_ERROR';
  return json(status, { success: false, error: { code, message: `Failed with ${status}` } });
}

/** The list row the API returns for a stored collection, in the recipe context. */
function listRow(c: StoredCollection, recipeId: string | null): CollectionListItemOutput {
  const { recipeIds, ...row } = c;
  return {
    ...row,
    recipeCount: recipeIds.length,
    ...(recipeId ? { containsRecipe: recipeIds.includes(recipeId) } : {}),
  };
}

/** Stubs `fetch` with the collection endpoints the modal uses and records every call. */
function stubApi(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(respond(input, init))),
  );
}

/** Answers one stubbed collection API request synchronously and records it. */
function respond(input: RequestInfo | URL, init?: RequestInit): Response {
  const url = new URL(String(input), 'http://localhost');
  const path = url.pathname.replace(/^\/api\/v1/, '');
  const method = init?.method ?? 'GET';
  const body = typeof init?.body === 'string' ? init.body : null;
  requests.push({ line: `${method} ${path}${url.search}`, body });

  if (method === 'GET' && path === '/collections') {
    if (listStatus !== 200) return apiError(listStatus);
    const recipeId = url.searchParams.get('recipeId');
    const data = stored.map((c) => listRow(c, recipeId));
    return json(200, {
      success: true,
      data,
      meta: {
        requestId: 'test',
        pagination: { page: 1, perPage: 20, total: data.length, totalPages: 1 },
      },
    });
  }
  if (method === 'POST' && path === '/collections') {
    if (createStatus !== 201) return apiError(createStatus);
    const { name, visibility } = JSON.parse(body ?? '{}') as {
      name: string;
      visibility: StoredCollection['visibility'];
    };
    const created = makeStored({ id: 'c-new', name, visibility });
    stored.push(created);
    return json(201, {
      success: true,
      data: {
        ...listRow(created, null),
        author: { username: 'tester', displayName: null, avatarUrl: null },
        items: [],
      },
    });
  }
  const add = /^\/collections\/([^/]+)\/recipes$/.exec(path);
  if (method === 'POST' && add) {
    if (addStatus !== 201) return apiError(addStatus);
    const { recipeId } = JSON.parse(body ?? '{}') as { recipeId: string };
    stored.find((c) => c.id === add[1])?.recipeIds.push(recipeId);
    return json(201, { success: true, data: { message: 'Recipe added' } });
  }
  const remove = /^\/collections\/([^/]+)\/recipes\/([^/]+)$/.exec(path);
  if (method === 'DELETE' && remove) {
    if (removeStatus !== 200) return apiError(removeStatus);
    const target = stored.find((c) => c.id === remove[1]);
    if (target) target.recipeIds = target.recipeIds.filter((id) => id !== remove[2]);
    return json(200, { success: true, data: { message: 'Recipe removed' } });
  }
  return apiError(404);
}

/** Props the page renders the modal with (reset before each test). */
let modalProps: { open: boolean; recipeVisibility?: string } = { open: true };

/** The page route (real detail `shouldRevalidate`) plus the real collections resource route. */
function routesWith(element: () => ReactElement): RouteObject[] {
  return [
    {
      path: '/recipes/:slug',
      loader: () => {
        pageLoaderRuns += 1;
        return { ok: true };
      },
      shouldRevalidate: shouldRevalidateDetail,
      Component: element,
    },
    {
      path: '/resources/collections/mine',
      loader: myCollectionsLoader,
      action: myCollectionsAction,
      shouldRevalidate: shouldRevalidateMyCollections,
    },
  ];
}

/** The page: the modal for {@link RECIPE_ID} with {@link modalProps}. */
function ModalPage() {
  return <AddToCollectionModal recipeId={RECIPE_ID} onClose={() => {}} {...modalProps} />;
}

/** Renders the modal page on `/recipes/my-espresso`, signed in. */
function renderModal() {
  return renderWithAppProviders(routesWith(ModalPage), {
    initialEntries: ['/recipes/my-espresso'],
    auth: 'user',
    locale: 'en',
  });
}

/** Waits until every fetcher and navigation is idle. */
async function waitForIdle(router: ReturnType<typeof renderWithAppProviders>['router']) {
  await waitFor(() => {
    expect(router.state.navigation.state).toBe('idle');
    expect(router.state.revalidation).toBe('idle');
    expect([...router.state.fetchers.values()].every((f) => f.state === 'idle')).toBe(true);
  });
}

/** The toggle button of the collection named `name`. */
function rowOf(name: string): HTMLButtonElement {
  const row = screen.getByText(name).closest('button');
  expect(row).not.toBeNull();
  return row as HTMLButtonElement;
}

/** True when the row of `name` shows the "already in this collection" checkmark. */
function isChecked(name: string): boolean {
  return rowOf(name).querySelector(`[aria-label="${t('collection.modal.alreadyIn')}"]`) !== null;
}

/** The request lines sent so far. */
function lines(): string[] {
  return requests.map((r) => r.line);
}

beforeEach(() => {
  requests = [];
  stored = [
    makeStored({ id: 'c1', name: 'Alpha', recipeIds: [RECIPE_ID, 'other-recipe'] }),
    makeStored({ id: 'c2', name: 'Beta', visibility: 'public', recipeIds: [] }),
  ];
  listStatus = 200;
  addStatus = 201;
  removeStatus = 200;
  createStatus = 201;
  pageLoaderRuns = 0;
  modalProps = { open: true };
  localStorage.clear();
  stubApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AddToCollectionModal — membership', () => {
  it('loads my collections through the resource route and marks those containing the recipe', async () => {
    const { router } = renderModal();

    await screen.findByText('Alpha');
    await waitForIdle(router);
    expect(lines()).toEqual([`GET /collections?recipeId=${RECIPE_ID}`]);
    expect(isChecked('Alpha')).toBe(true);
    expect(isChecked('Beta')).toBe(false);
  });

  it('sends no request while closed', async () => {
    modalProps = { open: false };
    const { router } = renderModal();

    await waitForIdle(router);
    expect(pageLoaderRuns).toBe(1);
    expect(lines()).toEqual([]);
  });

  it('clicking a checked collection submits remove: one DELETE, no add, no page revalidation', async () => {
    const { router } = renderModal();
    await screen.findByText('Alpha');
    await waitForIdle(router);
    requests = [];

    await userEvent.setup().click(rowOf('Alpha'));

    await waitFor(() => expect(isChecked('Alpha')).toBe(false));
    await waitForIdle(router);
    expect(lines()).toEqual([`DELETE /collections/c1/recipes/${RECIPE_ID}`]);
    expect(rowOf('Alpha')).toHaveTextContent('1');
    expect(pageLoaderRuns).toBe(1);
  });

  it('clicking an unchecked collection submits add: one POST, the checkmark and count follow', async () => {
    const { router } = renderModal();
    await screen.findByText('Beta');
    await waitForIdle(router);
    requests = [];

    await userEvent.setup().click(rowOf('Beta'));

    await waitFor(() => expect(isChecked('Beta')).toBe(true));
    await waitForIdle(router);
    expect(requests).toEqual([
      { line: 'POST /collections/c2/recipes', body: JSON.stringify({ recipeId: RECIPE_ID }) },
    ]);
    expect(rowOf('Beta')).toHaveTextContent('1');
    expect(isChecked('Beta')).toBe(true);
    expect(pageLoaderRuns).toBe(1);
  });

  it('a failed add (500) rolls the checkmark back and shows an error toast', async () => {
    addStatus = 500;
    const { router } = renderModal();
    await screen.findByText('Beta');
    await waitForIdle(router);

    await userEvent.setup().click(rowOf('Beta'));

    expect(await screen.findByText(t('collection.error.add'))).toBeInTheDocument();
    await waitForIdle(router);
    expect(isChecked('Beta')).toBe(false);
    expect(rowOf('Beta')).toHaveTextContent('0');
    expect(rowOf('Beta')).toBeEnabled();
  });

  it('a 409 on add keeps the membership, shows no error toast and sends no remove', async () => {
    addStatus = 409;
    const { router } = renderModal();
    await screen.findByText('Beta');
    await waitForIdle(router);
    requests = [];

    await userEvent.setup().click(rowOf('Beta'));

    await waitFor(() => expect(lines()).toEqual(['POST /collections/c2/recipes']));
    await waitForIdle(router);
    expect(isChecked('Beta')).toBe(true);
    expect(screen.queryByText(t('collection.error.add'))).toBeNull();
    expect(lines()).toEqual(['POST /collections/c2/recipes']);
  });

  it('a failed remove (500) restores the checkmark and shows an error toast', async () => {
    removeStatus = 500;
    const { router } = renderModal();
    await screen.findByText('Alpha');
    await waitForIdle(router);

    await userEvent.setup().click(rowOf('Alpha'));

    expect(await screen.findByText(t('collection.error.remove'))).toBeInTheDocument();
    await waitForIdle(router);
    expect(isChecked('Alpha')).toBe(true);
    expect(rowOf('Alpha')).toHaveTextContent('2');
  });
});

describe('AddToCollectionModal — loading', () => {
  it('a failed load shows the load error with Retry instead of an empty list', async () => {
    listStatus = 500;
    const { router } = renderModal();

    expect(await screen.findByText(t('collection.error.load'))).toBeInTheDocument();
    expect(screen.queryByText(t('collection.modal.selectCollection'))).toBeNull();
    await waitForIdle(router);

    listStatus = 200;
    await userEvent.setup().click(screen.getByRole('button', { name: t('common.retry') }));

    await screen.findByText('Alpha');
    expect(screen.queryByText(t('collection.error.load'))).toBeNull();
    expect(lines()).toEqual([
      `GET /collections?recipeId=${RECIPE_ID}`,
      `GET /collections?recipeId=${RECIPE_ID}`,
    ]);
  });
});

describe('AddToCollectionModal — create', () => {
  it('creates the collection, adds the recipe, reloads the list and clears the name', async () => {
    const { router } = renderModal();
    await screen.findByText('Alpha');
    await waitForIdle(router);
    requests = [];
    const user = userEvent.setup();

    const name = screen.getByPlaceholderText(t('collection.create.name'));
    await user.type(name, 'Weekend brews');
    await user.click(screen.getByRole('button', { name: t('collection.create.submit') }));

    await screen.findByText('Weekend brews');
    await waitForIdle(router);
    expect(lines()).toEqual([
      'POST /collections',
      'POST /collections/c-new/recipes',
      `GET /collections?recipeId=${RECIPE_ID}`,
    ]);
    expect(JSON.parse(requests[0].body ?? '{}')).toEqual({
      name: 'Weekend brews',
      visibility: 'private',
    });
    expect(isChecked('Weekend brews')).toBe(true);
    expect(name).toHaveValue('');
    expect(pageLoaderRuns).toBe(1);
  });

  it('a failed create shows an error toast and keeps the typed name', async () => {
    createStatus = 500;
    const { router } = renderModal();
    await screen.findByText('Alpha');
    await waitForIdle(router);
    requests = [];
    const user = userEvent.setup();

    const name = screen.getByPlaceholderText(t('collection.create.name'));
    await user.type(name, 'Weekend brews');
    await user.click(screen.getByRole('button', { name: t('collection.create.submit') }));

    expect(await screen.findByText(t('collection.error.save'))).toBeInTheDocument();
    await waitForIdle(router);
    expect(name).toHaveValue('Weekend brews');
    expect(lines()).toEqual(['POST /collections']);
  });

  it('a failed add after the create shows an error toast and still lists the new collection', async () => {
    addStatus = 500;
    const { router } = renderModal();
    await screen.findByText('Alpha');
    await waitForIdle(router);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText(t('collection.create.name')), 'Weekend brews');
    await user.click(screen.getByRole('button', { name: t('collection.create.submit') }));

    expect(await screen.findByText(t('collection.error.add'))).toBeInTheDocument();
    await screen.findByText('Weekend brews');
    await waitForIdle(router);
    expect(isChecked('Weekend brews')).toBe(false);
  });
});

describe('AddToCollectionModal — hidden-recipe note', () => {
  for (const recipeVisibility of ['draft', 'private', 'unlisted'] as const) {
    it(`renders the hidden-recipe note for a ${recipeVisibility} recipe`, async () => {
      modalProps = { open: true, recipeVisibility };
      renderModal();

      await screen.findByText('Alpha');
      expect(screen.getByText(t('collection.modal.hiddenRecipeNote'))).toBeInTheDocument();
    });
  }

  it('does not render the note for a public recipe', async () => {
    modalProps = { open: true, recipeVisibility: 'public' };
    renderModal();

    await screen.findByText('Alpha');
    expect(screen.queryByText(t('collection.modal.hiddenRecipeNote'))).toBeNull();
  });

  it('does not render the note when no visibility is passed', async () => {
    renderModal();

    await screen.findByText('Alpha');
    expect(screen.queryByText(t('collection.modal.hiddenRecipeNote'))).toBeNull();
  });
});

describe('AddToCollectionButton', () => {
  it('forwards recipeVisibility to the modal it opens, which loads on open', async () => {
    const { router } = renderWithAppProviders(
      routesWith(() => <AddToCollectionButton recipeId={RECIPE_ID} recipeVisibility="unlisted" />),
      { initialEntries: ['/recipes/my-espresso'], auth: 'user', locale: 'en' },
    );
    await waitForIdle(router);
    expect(lines()).toEqual([]);

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: t('collection.modal.add') }));

    await screen.findByText('Alpha');
    expect(screen.getByText(t('collection.modal.hiddenRecipeNote'))).toBeInTheDocument();
    expect(lines()).toEqual([`GET /collections?recipeId=${RECIPE_ID}`]);
  });
});
