import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { I18nProvider } from '../../contexts/I18nContext.tsx';
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

vi.mock('../../contexts/AuthContext.tsx', () => ({
  useAuth: vi.fn(() => ({
    user: {
      id: 'u1',
      email: 'x@y.z',
      username: 'x',
      displayName: 'X',
      avatarUrl: null,
      isAdmin: false,
      onboardingCompleted: false,
      emailVerifiedAt: null,
    },
    isAuthenticated: true,
    isLoading: false,
    sessionError: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn().mockResolvedValue(undefined),
    clearSessionError: vi.fn(),
  })),
}));

import { api } from '../../api/client.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';

const mockApi = vi.mocked(api);
const mockUseAuth = vi.mocked(useAuth);

function renderWizard() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <OnboardingWizard />,
        children: [
          { path: 'recipes/new', element: null },
          { path: 'setups', element: null },
          { path: 'beans', element: null },
          { path: 'recipes', element: null },
        ],
      },
    ],
    { initialEntries: ['/'] },
  );
  return {
    router,
    ...render(
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>,
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockApi.get.mockResolvedValue([]);
  mockApi.post.mockResolvedValue({ id: 'b1' });
  mockApi.patch.mockResolvedValue({});
  mockUseAuth.mockReturnValue({
    user: {
      id: 'u1',
      email: 'x@y.z',
      username: 'x',
      displayName: 'X',
      avatarUrl: null,
      isAdmin: false,
      onboardingCompleted: false,
      emailVerifiedAt: null,
    },
    isAuthenticated: true,
    isLoading: false,
    sessionError: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn().mockResolvedValue(undefined),
    clearSessionError: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>);
});

/**
 * OnboardingWizard — five-step onboarding flow (welcome → equipment →
 * beans → first brew → explore). Skip and complete both call
 * `api.patch('/preferences', { onboardingCompleted: true })` and
 * navigate home.
 */
describe('OnboardingWizard', () => {
  it('renders the welcome step on mount', () => {
    renderWizard();
    expect(screen.getByText('Welcome to BrewForm!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });

  it('advances from step 1 (welcome) to step 2 (equipment) on "Next" click', async () => {
    const user = userEvent.setup();
    renderWizard();
    expect(screen.getByText('Welcome to BrewForm!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    // Equipment step heading uses the en.json translation of onboarding.equipment
    expect(screen.getByText('Add Your Equipment')).toBeInTheDocument();
    expect(screen.queryByText('Welcome to BrewForm!')).not.toBeInTheDocument();
  });

  it('calls api.patch("/preferences") with onboardingCompleted:true when "Skip" is clicked', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => {
      expect(mockApi.patch).toHaveBeenCalledWith('/preferences', { onboardingCompleted: true });
    });
  });

  it('renders the "Get Started!" button on the final step and calls api.patch on completion', async () => {
    const user = userEvent.setup();
    renderWizard();
    // Advance through all 4 "Next" clicks to reach the last step (explore)
    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole('button', { name: 'Next' }));
    }
    const getStarted = screen.getByRole('button', { name: 'Get Started!' });
    expect(getStarted).toBeInTheDocument();
    await user.click(getStarted);
    await waitFor(() => {
      expect(mockApi.patch).toHaveBeenCalledWith('/preferences', { onboardingCompleted: true });
    });
  });

  it('still navigates home when api.patch rejects (catch branch)', async () => {
    mockApi.patch.mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    const { router } = renderWizard();
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
  });
});
