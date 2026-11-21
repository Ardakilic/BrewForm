import { t } from '@brewform/shared/i18n';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import type { ActionFunction } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { LikeButton } from './LikeButton.tsx';

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

/** A route action that never settles (the button stays pending). */
const HANGING: ActionFunction = () => new Promise(() => undefined);

/** Renders `ui` at `/` with the app providers and `action` on `recipes/:id/like`. */
function renderButton(ui: ReactElement, action: ActionFunction = HANGING) {
  return renderWithAppProviders([
    { path: '/', element: ui, children: [{ path: 'recipes/:id/like', action, element: null }] },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('LikeButton — layout (no w-full)', () => {
  it.each([
    [false, 0],
    [true, 5],
  ])('has no w-full class (initialLiked=%s, initialCount=%i)', (initial, count) => {
    renderButton(<LikeButton recipeId="recipe-1" initialLiked={initial} initialCount={count} />);
    expect(screen.getByRole('button').classList.contains('w-full')).toBe(false);
  });
});

describe('LikeButton — count display', () => {
  it.each([0, 7])('renders the initial count %i', (count) => {
    renderButton(<LikeButton recipeId="recipe-1" initialLiked={false} initialCount={count} />);
    expect(screen.getByRole('button').textContent).toContain(String(count));
  });
});

describe('LikeButton — click interaction', () => {
  it('clicking the button disables it while pending', async () => {
    const user = userEvent.setup();
    renderButton(<LikeButton recipeId="recipe-1" initialLiked={false} initialCount={3} />);
    const button = screen.getByRole('button');
    expect(button).not.toBeDisabled();

    await user.click(button);

    await waitFor(() => expect(button).toBeDisabled());
  });
});

describe('LikeButton — settled state and rollback', () => {
  it('reverts to the pre-click state and toasts when the action fails', async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({ ok: false, error: 'server error', liked: false });
    renderButton(<LikeButton recipeId="recipe-1" initialLiked={false} initialCount={3} />, action);
    const button = screen.getByRole('button');

    await user.click(button);

    await waitFor(() => {
      expect(button).not.toBeDisabled();
      expect(button.textContent).toContain('3');
    });
    expect(await screen.findByText(t('recipe.like.error'))).toBeInTheDocument();
    expect(action).toHaveBeenCalled();
  });

  it('keeps the confirmed state and count after { ok: true, liked } (no revalidation)', async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({ ok: true, liked: true });
    renderButton(<LikeButton recipeId="recipe-1" initialLiked={false} initialCount={3} />, action);
    const button = screen.getByRole('button');

    await user.click(button);

    await waitFor(() => {
      expect(button).not.toBeDisabled();
      expect(button.textContent).toContain('4');
    });
  });

  it('a failure after a success keeps the state the success confirmed', async () => {
    const user = userEvent.setup();
    const action = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, liked: true })
      .mockResolvedValueOnce({ ok: false, error: 'server error', liked: true });
    renderButton(<LikeButton recipeId="recipe-1" initialLiked={false} initialCount={3} />, action);
    const button = screen.getByRole('button');

    await user.click(button);
    await waitFor(() => {
      expect(button).not.toBeDisabled();
      expect(button.textContent).toContain('4');
    });
    await user.click(button);

    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(2);
      expect(button).not.toBeDisabled();
    });
    expect(button.textContent).toContain('4');
    expect(await screen.findByText(t('recipe.like.error'))).toBeInTheDocument();
  });

  it('toasts error.unauthorized for an UNAUTHORIZED failure', async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({
      ok: false,
      error: 'no session',
      code: 'UNAUTHORIZED',
      liked: false,
    });
    renderButton(<LikeButton recipeId="recipe-1" initialLiked={false} initialCount={3} />, action);

    await user.click(screen.getByRole('button'));

    expect(await screen.findByText(t('error.unauthorized'))).toBeInTheDocument();
    expect(screen.queryByText(t('recipe.like.error'))).toBeNull();
  });
});
