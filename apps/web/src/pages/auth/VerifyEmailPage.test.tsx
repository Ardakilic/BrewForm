import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';

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

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: () => ({
    t: (k: string) => {
      const map: Record<string, string> = {
        'verifyEmail.verifying': 'E-postanız doğrulanıyor...',
        'verifyEmail.errorTitle': 'Doğrulama Başarısız',
        'verifyEmail.successTitle': 'E-posta Doğrulandı!',
        'verifyEmail.successMessage': 'E-postanız doğrulandı.',
        'verifyEmail.failed': 'Doğrulama başarısız.',
        'verifyEmail.noToken': 'Doğrulama jetonu sağlanmadı.',
        'common.goHome': 'Ana Sayfaya Git',
      };
      return map[k] ?? k;
    },
    locale: 'tr',
    setLocale: vi.fn(),
    availableLocales: ['en', 'tr'],
  }),
}));

vi.mock('../../contexts/AuthContext.tsx', () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    isAuthenticated: false,
    sessionError: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
    clearSessionError: vi.fn(),
  }),
}));

vi.mock('../../api/index.ts', () => ({
  authApi: {
    verifyEmail: vi.fn(),
  },
}));

import { authApi } from '../../api/index.ts';
import { VerifyEmailPage } from './VerifyEmailPage.tsx';

const mockAuthApi = vi.mocked(authApi);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('VerifyEmailPage — tr locale spot-check', () => {
  it('renders Turkish error title when verification fails', async () => {
    mockAuthApi.verifyEmail.mockRejectedValue(new Error('invalid token'));

    const router = createMemoryRouter(
      [
        {
          path: '/verify-email',
          element: <VerifyEmailPage />,
        },
      ],
      { initialEntries: ['/verify-email?token=bad-token'] },
    );

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByText('Doğrulama Başarısız')).toBeInTheDocument();
    });
  });
});
