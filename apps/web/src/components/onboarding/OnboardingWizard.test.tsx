import { t } from '@brewform/shared/i18n';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { action, loader } from './OnboardingWizard.data.ts';
import { OnboardingWizard } from './OnboardingWizard.tsx';

vi.mock('../../api/client.ts', () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({ id: 'b1' }),
    patch: vi.fn().mockResolvedValue({}),
  },
}));

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

import { api } from '../../api/client.ts';
import { renderWithAppProviders } from '../../test-utils/render.tsx';

const mockApi = vi.mocked(api);
const mockRefreshUser = vi.fn();

/** The signed-in user going through onboarding. */
const ONBOARDING_USER = {
  id: 'u1',
  email: 'x@y.z',
  username: 'x',
  displayName: 'X',
  avatarUrl: null,
  isAdmin: false,
  onboardingCompleted: false,
  emailVerifiedAt: null,
};

/** Hydrate fallback while the onboarding loader runs. */
const HydrateFallback = () => null;

/** Renders `/onboarding` through its real loader and action. */
function renderWizard() {
  return renderWithAppProviders(
    [
      { path: '/onboarding', element: <OnboardingWizard />, loader, action, HydrateFallback },
      { path: '/', element: <p>home</p> },
      { path: '/recipes/new', element: <p>new recipe</p> },
      { path: '/setups', element: null },
      { path: '/beans', element: null },
      { path: '/recipes', element: null },
    ],
    {
      initialEntries: ['/onboarding'],
      locale: 'en',
      auth: { user: ONBOARDING_USER, refreshUser: mockRefreshUser },
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockApi.get.mockResolvedValue([]);
  mockApi.post.mockResolvedValue({ id: 'b1' });
  mockApi.patch.mockResolvedValue({});
  mockRefreshUser.mockResolvedValue(undefined);
});

/**
 * OnboardingWizard — five-step onboarding flow (welcome → equipment →
 * beans → first brew → explore). Skip and complete both call
 * `api.patch('/preferences', { onboardingCompleted: true })` and
 * navigate home.
 */
describe('OnboardingWizard', () => {
  it('renders the welcome step on mount', async () => {
    renderWizard();
    expect(await screen.findByText('Welcome to BrewForm!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });

  it('advances from step 1 (welcome) to step 2 (equipment) on "Next" click', async () => {
    const user = userEvent.setup();
    renderWizard();
    expect(await screen.findByText('Welcome to BrewForm!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    // Equipment step heading uses the en.json translation of onboarding.equipment
    expect(screen.getByText('Add Your Equipment')).toBeInTheDocument();
    expect(screen.queryByText('Welcome to BrewForm!')).not.toBeInTheDocument();
  });

  it('calls api.patch("/preferences") with onboardingCompleted:true when "Skip" is clicked', async () => {
    const user = userEvent.setup();
    const { router } = renderWizard();
    await user.click(await screen.findByRole('button', { name: 'Skip' }));
    await waitFor(() => {
      expect(mockApi.patch).toHaveBeenCalledWith(
        '/preferences',
        { onboardingCompleted: true },
        { signal: expect.any(AbortSignal) },
      );
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('renders the "Get Started!" button on the final step and calls api.patch on completion', async () => {
    const user = userEvent.setup();
    renderWizard();
    await screen.findByText('Welcome to BrewForm!');
    // Advance through all 4 "Next" clicks to reach the last step (explore)
    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole('button', { name: 'Next' }));
    }
    const getStarted = screen.getByRole('button', { name: 'Get Started!' });
    expect(getStarted).toBeInTheDocument();
    await user.click(getStarted);
    await waitFor(() => {
      expect(mockApi.patch).toHaveBeenCalledWith(
        '/preferences',
        { onboardingCompleted: true },
        { signal: expect.any(AbortSignal) },
      );
    });
  });

  it('still navigates home when api.patch rejects (catch branch)', async () => {
    mockApi.patch.mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    const { router } = renderWizard();
    await user.click(await screen.findByRole('button', { name: 'Skip' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
  });

  it('lists the saved setups from the loader on the equipment step', async () => {
    mockApi.get.mockResolvedValue([{ id: 's1', name: 'Home V60' }]);
    const user = userEvent.setup();
    renderWizard();
    await user.click(await screen.findByRole('button', { name: 'Next' }));
    expect(screen.getByRole('option', { name: 'Home V60' })).toBeInTheDocument();
    expect(mockApi.get).toHaveBeenCalledWith('/setups', { signal: expect.any(AbortSignal) });
  });

  it('falls back to the create-setup link when the setups list fails', async () => {
    mockApi.get.mockRejectedValue(new Error('down'));
    const user = userEvent.setup();
    renderWizard();
    await user.click(await screen.findByRole('button', { name: 'Next' }));
    expect(screen.getByText('Add Your Equipment')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('quick-adds a bean through the action and carries it into the first-brew link', async () => {
    const user = userEvent.setup();
    const { router } = renderWizard();
    await user.click(await screen.findByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.type(screen.getByPlaceholderText(t('onboarding.beans.originPlaceholder')), 'Kenya');
    await user.click(screen.getByRole('button', { name: t('onboarding.beansAction') }));

    expect(await screen.findByText(t('onboarding.beans.saved'))).toBeInTheDocument();
    expect(mockApi.post).toHaveBeenCalledWith(
      '/beans',
      { name: 'Kenya', origin: 'Kenya' },
      { signal: expect.any(AbortSignal) },
    );

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: t('onboarding.firstBrewAction') }));
    await waitFor(() => expect(router.state.location.search).toBe('?beanId=b1'));
  });
});
