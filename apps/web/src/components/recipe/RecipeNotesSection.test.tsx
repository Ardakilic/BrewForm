/**
 * `RecipeNotesSection` — the viewer's private-notes editor (`recipe-personal-notes` spec,
 * "Recipe detail page separates private notes from brewer notes"). The section runs inside a
 * page route that uses the real detail `shouldRevalidate`, next to the real
 * `resources/recipes/:id/notes` resource route and the real API client over a stubbed `fetch`,
 * so the tests see the exact HTTP requests a load, save or delete sends.
 */
import { t } from '@brewform/shared/i18n';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type RouteObject, useParams } from 'react-router';
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
  recipeNoteAction,
  recipeNoteLoader,
  shouldRevalidateRecipeNote,
} from '../../routes/resources/recipe-notes.ts';
import { type AuthFixture, renderWithAppProviders } from '../../test-utils/render.tsx';
import { RecipeNotesSection } from './RecipeNotesSection.tsx';

const RECIPE_ID = '11111111-1111-4111-8111-111111111111';
const NOTES_PATH = `/recipes/${RECIPE_ID}/notes`;
/** A second recipe, reached at `/recipes/other`, whose note `GET` waits for {@link otherGate}. */
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_NOTES_PATH = `/recipes/${OTHER_ID}/notes`;

/** One recorded HTTP request: `METHOD /path` plus its raw body. */
interface RecordedRequest {
  line: string;
  body: string | null;
}

/** Every request the section sent. */
let requests: RecordedRequest[] = [];
/** The stored private note the stubbed API serves (`null` = none). */
let storedNote: string | null = null;
/** Status the stubbed API answers a `PUT`/`DELETE` with (200 = success). */
let writeStatus = 200;
/** Status the stubbed API answers a `GET` with (200 = success). */
let readStatus = 200;
/** How many times the page route's loader ran. */
let pageLoaderRuns = 0;
/** Resolves the pending `GET` of the second recipe's note. */
let otherGate: Promise<void> = Promise.resolve();

/** A JSON response with the given status and body. */
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** The success envelope of a private-note payload. */
function noteEnvelope(notes: string | null, recipeId = RECIPE_ID): Response {
  return json(200, {
    success: true,
    data: {
      recipeId,
      notes,
      updatedAt: notes === null ? null : '2026-11-20T10:00:00.000Z',
    },
  });
}

/** The error envelope for `status`. */
function apiError(status: number): Response {
  return json(status, { success: false, error: { code: 'INTERNAL_ERROR', message: 'Boom' } });
}

/** Stubs `fetch` with the caller-scoped notes endpoints (GET, PUT, DELETE) and records calls. */
function stubApi(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      const path = url.pathname.replace(/^\/api\/v1/, '');
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? init.body : null;
      requests.push({ line: `${method} ${path}`, body });
      if (method === 'GET' && path === OTHER_NOTES_PATH) {
        await otherGate;
        return noteEnvelope('Note on the other recipe', OTHER_ID);
      }
      if (path !== NOTES_PATH) return apiError(404);
      if (method === 'GET') return readStatus === 200 ? noteEnvelope(storedNote) : apiError(500);
      if (method === 'PUT') {
        if (writeStatus !== 200) return apiError(writeStatus);
        storedNote = (JSON.parse(body ?? '{}') as { notes: string }).notes;
        return noteEnvelope(storedNote);
      }
      if (method === 'DELETE') {
        if (writeStatus !== 200) return apiError(writeStatus);
        storedNote = null;
        return noteEnvelope(null);
      }
      return apiError(404);
    }),
  );
}

/** The page: the section for `RECIPE_ID`, or for `OTHER_ID` on `/recipes/other`. */
function SectionForSlug() {
  const { slug } = useParams();
  return <RecipeNotesSection recipeId={slug === 'other' ? OTHER_ID : RECIPE_ID} />;
}

/** The page route (real detail `shouldRevalidate`) plus the real notes resource route. */
const routes: RouteObject[] = [
  {
    path: '/recipes/:slug',
    loader: () => {
      pageLoaderRuns += 1;
      return { ok: true };
    },
    shouldRevalidate: shouldRevalidateDetail,
    Component: SectionForSlug,
  },
  {
    path: '/resources/recipes/:id/notes',
    loader: recipeNoteLoader,
    action: recipeNoteAction,
    shouldRevalidate: shouldRevalidateRecipeNote,
  },
];

/** Renders the section on `/recipes/my-espresso`. */
function renderSection(auth: AuthFixture = 'user', locale: 'en' | 'tr' = 'en') {
  return renderWithAppProviders(routes, {
    initialEntries: ['/recipes/my-espresso'],
    auth,
    locale,
  });
}

/** Renders signed in and waits until the private note has loaded into the editor. */
async function renderLoaded(locale: 'en' | 'tr' = 'en') {
  const result = renderSection('user', locale);
  const textarea = await screen.findByRole('textbox', { name: t('recipe.myNotes', locale) });
  await waitFor(() => expect(textarea).toBeEnabled());
  return { ...result, textarea };
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
  storedNote = null;
  writeStatus = 200;
  readStatus = 200;
  pageLoaderRuns = 0;
  otherGate = Promise.resolve();
  localStorage.clear();
  stubApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RecipeNotesSection', () => {
  it("starts empty for a viewer with no note: it loads the viewer's own note, never the brewer note", async () => {
    const { textarea, router } = await renderLoaded();
    await waitForIdle(router);

    expect(textarea).toHaveValue('');
    expect(requests.map((r) => r.line)).toEqual([`GET ${NOTES_PATH}`]);
    expect(screen.queryByRole('button', { name: t('recipe.notes.delete') })).toBeNull();
  });

  it("loads the viewer's existing note into the editor and offers Delete", async () => {
    storedNote = 'My own take';
    const { textarea } = await renderLoaded();

    expect(textarea).toHaveValue('My own take');
    expect(screen.getByRole('button', { name: t('recipe.notes.delete') })).toBeInTheDocument();
  });

  it('labels come from the recipe.myNotes keys (English)', async () => {
    const { textarea } = await renderLoaded();

    expect(screen.getByRole('region', { name: t('recipe.myNotes') })).toBeInTheDocument();
    expect(screen.getByText(t('recipe.myNotes'), { selector: 'h2' })).toBeInTheDocument();
    expect(screen.getByText(t('recipe.myNotes.hint'))).toBeInTheDocument();
    expect(textarea).toHaveAttribute('placeholder', t('recipe.myNotes.placeholder'));
    expect(screen.queryByText('Personal Notes')).toBeNull();
  });

  it('labels come from the recipe.myNotes keys (Turkish)', async () => {
    storedNote = 'Benim notum';
    const { textarea } = await renderLoaded('tr');

    expect(screen.getByText(t('recipe.myNotes', 'tr'), { selector: 'h2' })).toBeInTheDocument();
    expect(screen.getByText(t('recipe.myNotes.hint', 'tr'))).toBeInTheDocument();
    expect(textarea).toHaveAttribute('placeholder', t('recipe.myNotes.placeholder', 'tr'));
    expect(
      screen.getByRole('button', { name: t('recipe.notes.delete', 'tr') }),
    ).toBeInTheDocument();
  });

  it('saving sends exactly one PUT /recipes/:id/notes and never re-runs the page loader', async () => {
    const user = userEvent.setup();
    const { textarea, router } = await renderLoaded();
    await waitForIdle(router);
    requests = [];

    await user.type(textarea, 'Mine');
    await user.click(screen.getByRole('button', { name: t('common.save') }));
    expect(await screen.findByText(t('recipe.notes.saved'))).toBeInTheDocument();
    await waitForIdle(router);

    expect(requests).toEqual([
      { line: `PUT ${NOTES_PATH}`, body: JSON.stringify({ notes: 'Mine' }) },
    ]);
    expect(requests.some((r) => r.line.startsWith('POST '))).toBe(false);
    expect(requests.some((r) => r.line.startsWith('PATCH '))).toBe(false);
    expect(pageLoaderRuns).toBe(1);
    expect(textarea).toHaveValue('Mine');
    expect(screen.getByRole('button', { name: t('recipe.notes.delete') })).toBeInTheDocument();
  });

  it('a save failure shows an error and keeps the typed text', async () => {
    const user = userEvent.setup();
    writeStatus = 500;
    const { textarea, router } = await renderLoaded();

    await user.type(textarea, 'Keep me');
    await user.click(screen.getByRole('button', { name: t('common.save') }));
    await waitForIdle(router);

    expect(await screen.findByRole('alert')).toHaveTextContent(t('recipe.notes.saveError'));
    expect(textarea).toHaveValue('Keep me');
    expect(screen.queryByText(t('recipe.notes.saved'))).toBeNull();
  });

  it('delete clears the editor and hides the Delete action', async () => {
    const user = userEvent.setup();
    storedNote = 'To be removed';
    const { textarea, router } = await renderLoaded();
    requests = [];

    await user.click(screen.getByRole('button', { name: t('recipe.notes.delete') }));
    expect(await screen.findByText(t('recipe.notes.deleted'))).toBeInTheDocument();
    await waitForIdle(router);

    expect(textarea).toHaveValue('');
    expect(screen.queryByRole('button', { name: t('recipe.notes.delete') })).toBeNull();
    expect(requests.map((r) => r.line)).toEqual([`DELETE ${NOTES_PATH}`]);
    expect(pageLoaderRuns).toBe(1);
  });

  it('a delete failure shows an error and keeps the note', async () => {
    const user = userEvent.setup();
    storedNote = 'Still here';
    writeStatus = 500;
    const { textarea, router } = await renderLoaded();

    await user.click(screen.getByRole('button', { name: t('recipe.notes.delete') }));
    await waitForIdle(router);

    expect(await screen.findByRole('alert')).toHaveTextContent(t('recipe.notes.saveError'));
    expect(textarea).toHaveValue('Still here');
    expect(screen.getByRole('button', { name: t('recipe.notes.delete') })).toBeInTheDocument();
  });

  it('a load failure shows the load error, keeps the editor disabled, and Retry reloads', async () => {
    const user = userEvent.setup();
    readStatus = 500;
    storedNote = 'Recovered';
    const { router } = renderSection();

    expect(await screen.findByRole('alert')).toHaveTextContent(t('recipe.notes.loadError'));
    await waitForIdle(router);
    expect(screen.getByRole('textbox', { name: t('recipe.myNotes') })).toBeDisabled();
    expect(screen.getByRole('button', { name: t('common.save') })).toBeDisabled();

    readStatus = 200;
    await user.click(screen.getByRole('button', { name: t('common.retry') }));
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: t('recipe.myNotes') })).toHaveValue('Recovered'),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it("prints only the viewer's own saved note", async () => {
    storedNote = 'Printed note';
    const { container } = await renderLoaded();

    const printOnly = container.querySelector('.print-only');
    expect(printOnly).toHaveTextContent('Printed note');
    expect(container.querySelector('section')).not.toHaveClass('print-hidden');
  });

  it('prints nothing when the viewer has no note', async () => {
    const { container } = await renderLoaded();

    expect(container.querySelector('.print-only')).toBeNull();
    expect(container.querySelector('section')).toHaveClass('print-hidden');
  });

  it("switching recipes clears the editor until the new recipe's own note loads", async () => {
    storedNote = 'Note on the first recipe';
    let releaseOther: () => void = () => {};
    otherGate = new Promise<void>((resolve) => {
      releaseOther = resolve;
    });
    const { router, textarea } = await renderLoaded();
    expect(textarea).toHaveValue('Note on the first recipe');

    await act(() => router.navigate('/recipes/other'));
    await waitFor(() => expect(requests.map((r) => r.line)).toContain(`GET ${OTHER_NOTES_PATH}`));
    // While the other recipe's note loads, the first recipe's note is gone and editing is off.
    const pending = screen.getByRole('textbox', { name: t('recipe.myNotes') });
    expect(pending).toHaveValue('');
    expect(pending).toBeDisabled();
    expect(screen.queryByRole('button', { name: t('recipe.notes.delete') })).toBeNull();

    releaseOther();
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: t('recipe.myNotes') })).toHaveValue(
        'Note on the other recipe',
      ),
    );
  });

  it('renders nothing and sends no notes request for an anonymous viewer', async () => {
    const { router, container } = renderSection('signed-out');
    await waitForIdle(router);

    expect(container.querySelector('section')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(requests).toEqual([]);
  });
});
